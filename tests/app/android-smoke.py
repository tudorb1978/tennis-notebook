"""Exercise an APK on a fresh, disposable emulator; never targets a physical phone."""
import argparse
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--serial', required=True)
parser.add_argument('--apk', required=True)
parser.add_argument('--output', default='/tmp')
parser.add_argument('--reset-test-records', action='store_true')
args = parser.parse_args()
if not args.serial.startswith('emulator-'):
    raise SystemExit('This test only runs on an explicitly selected emulator.')
adb = os.environ.get('ADB_EXECUTABLE', 'adb')
package = 'uk.tennisnotebook.app'

def run(*parts, binary=False, timeout=40):
    result = subprocess.run([adb, '-s', args.serial, *parts], capture_output=True, check=True, timeout=timeout)
    return result.stdout if binary else result.stdout.decode(errors='replace')

def nodes():
    run('shell', 'uiautomator', 'dump', '/sdcard/tennis-test-window.xml')
    raw = run('exec-out', 'cat', '/sdcard/tennis-test-window.xml')
    return list(ET.fromstring(raw).iter('node'))

def locate(items, text=None, label=None, resource=None):
    for node in items:
        attrs = node.attrib
        if text is not None and attrs.get('text') != text:
            continue
        if label is not None and attrs.get('content-desc') != label:
            continue
        if resource is not None and not (attrs.get('resource-id') == resource or attrs.get('resource-id', '').endswith(':id/' + resource)):
            continue
        box = list(map(int, re.findall(r'\d+', attrs.get('bounds', ''))))
        if len(box) == 4 and box[2] > box[0] and box[3] > box[1]:
            return box
    return None

def wait_for(**selector):
    for _ in range(14):
        box = locate(nodes(), **selector)
        if box:
            return box
        time.sleep(.3)
    raise AssertionError('Missing Android control: ' + str(selector))

def tap(scroll=False, **selector):
    for _ in range(7 if scroll else 1):
        box = locate(nodes(), **selector)
        if box:
            run('shell', 'input', 'tap', str((box[0]+box[2])//2), str((box[1]+box[3])//2))
            time.sleep(.3)
            return
        if scroll:
            run('shell', 'input', 'swipe', '540', '1900', '540', '700', '350')
    if not scroll:
        box = wait_for(**selector)
        run('shell', 'input', 'tap', str((box[0]+box[2])//2), str((box[1]+box[3])//2))
        time.sleep(.3)
        return
    raise AssertionError('Could not scroll to ' + str(selector))

def fill(resource, value, scroll=False):
    tap(resource=resource, scroll=scroll)
    run('shell', 'input', 'text', value.replace(' ', '%s'))
    run('shell', 'input', 'keyevent', '4')
    time.sleep(.3)

def replace_name(resource, value):
    tap(resource=resource, scroll=True)
    # Name fields are limited to 80 characters. Clear the existing value before typing its replacement.
    run('shell', 'input', 'keyevent', '123')
    run('shell', 'input', 'keyevent', *(['67'] * 80))
    run('shell', 'input', 'text', value.replace(' ', '%s'))
    run('shell', 'input', 'keyevent', '4')
    time.sleep(.3)

def capture(name):
    Path(args.output, name).write_bytes(run('exec-out', 'screencap', '-p', binary=True))

def pdf_app_text(items):
    return '\n'.join(
        n.attrib.get('text') or n.attrib.get('content-desc', '')
        for n in items if n.attrib.get('package') == package
    )

def assert_no_pdf_error(report, items):
    app_text = pdf_app_text(items)
    if any(message in app_text for message in (
        'URI is not absolute', 'FileSystemFile.bytes', 'Could not load a report asset',
        'Could not open this PDF.', 'This PDF is no longer available.',
        'File sharing is unavailable on this device.', 'No PDF viewer is available.',
    )):
        raise AssertionError(f'{report} PDF export failed:\n{app_text}')
    return app_text

def pdf_control(items, resource):
    return next((n for n in items if n.attrib.get('resource-id') == resource
        or n.attrib.get('resource-id', '').endswith(':id/' + resource)), None)

def wait_for_pdf_ready(report):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        items = nodes()
        app_text = assert_no_pdf_error(report, items)
        view, share = (pdf_control(items, resource) for resource in ('pdf-view', 'pdf-share'))
        if locate(items, text='Your PDF is ready') and view is not None and share is not None:
            if share.attrib.get('enabled') == 'true':
                return items
        time.sleep(.3)
    raise AssertionError(f'{report} PDF was not prepared within 60 seconds:\n{app_text}')

def wait_for_pdf_chooser(report):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        items = nodes()
        app_text = assert_no_pdf_error(report, items)
        if any(
            'intentresolver' in n.attrib.get('package', '')
            or 'Chooser' in n.attrib.get('class', '')
            or (n.attrib.get('package') != package and 'Sharing' in n.attrib.get('text', ''))
            for n in items
        ):
            return
        time.sleep(.3)
    raise AssertionError(f'{report} PDF export did not open Android’s share chooser within 60 seconds:\n{app_text}')

def wait_for_pdf_viewer(report):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        items = nodes()
        app_text = assert_no_pdf_error(report, items)
        activities = run('shell', 'dumpsys', 'activity', 'activities')
        resumed = re.search(r'\btopResumedActivity\s*[:=][^\n]*', activities) or \
            re.search(r'\bmResumedActivity\s*[:=][^\n]*', activities) or \
            re.search(r'\bResumedActivity\s*[:=][^\n]*', activities)
        if resumed and package not in resumed.group():
            # A resolver is a valid handoff when no default PDF viewer is set.
            # Check the PDF content URI and read grant rather than assuming a viewer's UI.
            intents = re.findall(r'Intent \{[^}]*\}', activities)
            preview_intent = next((intent for intent in intents
                if 'act=android.intent.action.VIEW' in intent
                and 'dat=content://' in intent and 'typ=application/pdf' in intent), None)
            if preview_intent:
                flags = re.search(r'flg=0x([0-9a-fA-F]+)', preview_intent)
                assert flags and int(flags[1], 16) & 1, \
                    f'{report} preview did not grant read access: {preview_intent}'
                external_text = '\n'.join(n.attrib.get('text', '') for n in items
                    if n.attrib.get('package') not in (package, 'com.android.systemui'))
                assert not re.search(r"cannot open|can't open|unable to open|invalid PDF|file not found", external_text, re.I), \
                    f'{report} PDF viewer could not open the file:\n{external_text}'
                return 'viewer chooser' if re.search(r'ResolverActivity|intentresolver', resumed.group(), re.I) else 'viewer'
        time.sleep(.3)
    raise AssertionError(f'{report} View PDF did not hand off to Android within 30 seconds:\n{app_text}')

def exercise_prepared_pdf(report, prefix):
    items = wait_for_pdf_ready(report)
    title = {'summary': 'Stats summary', 'point-by-point': 'Point-by-point',
        'combined': 'Combined report', 'player': 'Player performance'}[prefix]
    assert locate(items, text=title), f'{report} prepared the wrong report: {pdf_app_text(items)}'
    view = pdf_control(items, 'pdf-view')
    if view.attrib.get('enabled') == 'true':
        tap(resource='pdf-view')
        destination = wait_for_pdf_viewer(report)
        capture(f'tennis-native-{prefix}-view.png')
        run('shell', 'input', 'keyevent', '4')
        wait_for_pdf_ready(report)
        print(f'PASS Offline {report} PDF hands off to Android’s {destination} with read access; Back keeps the PDF ready', flush=True)
    else:
        app_text = pdf_app_text(items)
        assert 'A PDF viewer is needed to open this report.' in app_text and 'Share PDF' in app_text, \
            f'{report} has no viewer but does not explain the Share PDF fallback:\n{app_text}'
        print(f'PASS Offline {report} PDF explains the unavailable viewer and keeps Share PDF available', flush=True)
    tap(resource='pdf-share')
    wait_for_pdf_chooser(report)
    capture(f'tennis-native-{prefix}-share.png')
    run('shell', 'input', 'keyevent', '4')
    wait_for_pdf_ready(report)
    tap(text='Done')
    print(f'PASS Offline {report} PDF opens Android’s share chooser; cancellation preserves the prepared PDF', flush=True)

try:
    run('install', '-r', str(Path(args.apk).resolve()), timeout=90)
    if args.reset_test_records:
        avd = run('shell', 'getprop', 'ro.boot.qemu.avd_name').strip()
        if avd != 'tennis-tracker-test':
            raise SystemExit('Reset is restricted to the dedicated tennis-tracker-test AVD.')
        run('shell', 'pm', 'clear', package)
    run('shell', 'am', 'start', '-n', package+'/.MainActivity')
    wait_for(text='Your tennis notebook')
    tap(resource='new-match')
    fill('new-player-name', 'Alex')
    fill('opponent-name', 'Jamie')
    tap(resource='save-match', scroll=True)
    tap(label='Alex vs Jamie, Not started')
    tap(text='Start match')
    tap(resource='first-server-0')
    tap(resource='start-match')
    tap(resource='point-winner-0')
    tap(resource='shot-0-winner-forehand')
    wait_for(text='15')
    capture('tennis-native-recording.png')
    print('PASS Standalone APK launches, opens native SQLite, and records a forehand winner', flush=True)

    tap(resource='point-winner-0', scroll=True)
    tap(resource='more-shots-0-winner')
    wait_for(text='More shot types')
    run('shell', 'svc', 'wifi', 'disable')
    run('shell', 'svc', 'data', 'disable')
    run('shell', 'am', 'force-stop', package)
    run('shell', 'am', 'start', '-n', package+'/.MainActivity')
    wait_for(text='More shot types')
    run('shell', 'input', 'keyevent', '4')
    wait_for(text='Last shot of the rally')
    wait_for(text='15')
    tap(resource='more-shots-0-winner')
    wait_for(text='More shot types')
    tap(text='Close')
    wait_for(text='Last shot of the rally')
    wait_for(text='15')
    tap(resource='shot-0-winner-backhand')
    wait_for(text='30')
    print('PASS Offline cold start restores More shot types; Back and Close keep the point unsaved before direct backhand entry', flush=True)

    tap(label='Add notes', scroll=True)
    wait_for(text='Point notes')
    # Notes is the only editable field in this sheet.
    editable = [n for n in nodes() if n.attrib.get('class') == 'android.widget.EditText']
    assert editable, 'No editable note field'
    box = list(map(int, re.findall(r'\d+', editable[-1].attrib['bounds'])))
    run('shell', 'input', 'tap', str((box[0]+box[2])//2), str((box[1]+box[3])//2))
    run('shell', 'input', 'text', 'Native%soffline%snote')
    run('shell', 'input', 'keyevent', '4')
    tap(resource='save-point-notes', scroll=True)
    run('shell', 'am', 'force-stop', package)
    run('shell', 'am', 'start', '-n', package+'/.MainActivity')
    wait_for(resource='tab-history')
    tap(resource='tab-history')
    wait_for(text='Native offline note')
    print('PASS Native point details persist after process termination', flush=True)

    tap(resource='tab-record')
    tap(resource='recording-mode', scroll=True)
    tap(text='Score, serve & last shot', scroll=True)
    wait_for(resource='first-fault')
    assert locate(nodes(), resource='point-winner-0') is None, 'Winner is offered before the serve is recorded'
    tap(resource='skip-service-detail')
    wait_for(resource='return-result-in')
    assert locate(nodes(), resource='point-winner-0') is None, 'Unknown serve bypasses the return question'
    run('shell', 'am', 'force-stop', package)
    run('shell', 'am', 'start', '-n', package+'/.MainActivity')
    wait_for(resource='return-result-in')
    tap(resource='skip-service-detail')
    wait_for(resource='point-winner-0')
    run('shell', 'input', 'keyevent', '4')
    wait_for(resource='return-result-in')
    run('shell', 'input', 'keyevent', '4')
    wait_for(resource='first-fault')
    tap(resource='first-fault')
    wait_for(resource='second-in')
    assert locate(nodes(), resource='point-winner-0') is None, 'Winner is offered before the second serve'
    tap(resource='service-back')
    wait_for(resource='first-fault')
    tap(resource='first-fault')
    tap(resource='second-in')
    wait_for(resource='return-result-in')
    assert locate(nodes(), resource='point-winner-0') is None, 'Winner is offered before the return result'
    tap(resource='return-result-in')
    wait_for(resource='return-stroke-backhand')
    assert locate(nodes(), resource='point-winner-0') is None, 'Winner is offered before the return stroke'
    run('shell', 'am', 'force-stop', package)
    run('shell', 'am', 'start', '-n', package+'/.MainActivity')
    wait_for(resource='return-stroke-backhand')
    run('shell', 'input', 'keyevent', '4')
    wait_for(resource='return-result-in')
    tap(resource='return-result-in')
    tap(resource='return-stroke-backhand')
    wait_for(resource='point-winner-0')
    tap(resource='point-winner-0', scroll=True)
    wait_for(resource='shot-1-unforced-error-backhand')
    run('shell', 'input', 'keyevent', '4')
    wait_for(resource='point-winner-0')
    run('shell', 'input', 'keyevent', '4')
    wait_for(resource='return-stroke-backhand')
    tap(resource='return-stroke-backhand')
    tap(resource='point-winner-0', scroll=True)
    tap(resource='shot-1-unforced-error-backhand', scroll=True)
    wait_for(text='40')
    wait_for(resource='undo')
    print('PASS Guided serve/return entry gates winners, restores skipped and observed steps offline, and supports Back before saving', flush=True)

    tap(text='Pause', scroll=True)
    wait_for(text='Match paused')
    tap(text='Match details')
    wait_for(resource='edit-opponent-name')
    replace_name('edit-opponent-name', 'Robin')
    tap(text='Save match details', scroll=True)
    wait_for(text='Match paused')
    wait_for(text='40')
    run('shell', 'am', 'force-stop', package)
    run('shell', 'am', 'start', '-n', package+'/.MainActivity')
    wait_for(text='Match paused')
    wait_for(text='Robin')
    wait_for(text='40')
    tap(resource='tab-history')
    wait_for(text='Native offline note')
    print('PASS Opponent name edits persist after a cold start without changing the paused score or point notes', flush=True)
    tap(resource='tab-report')
    for variant in ('summary', 'point-by-point', 'combined'):
        tap(resource='match-pdf-export', scroll=True)
        wait_for(text='Export match PDF')
        tap(resource=f'match-pdf-{variant}')
        exercise_prepared_pdf(f'Match {variant}', variant)
        wait_for(resource='match-pdf-export')
    capture('tennis-native-report.png')

    tap(resource='back-to-matches')
    tap(text='Player performance', scroll=True)
    tap(text='Export player PDF', scroll=True)
    exercise_prepared_pdf('Player performance', 'player')
    wait_for(text='Export player PDF')
except Exception:
    try:
        capture('tennis-native-failure.png')
        Path(args.output, 'tennis-native-failure.xml').write_text(run('exec-out', 'cat', '/sdcard/tennis-test-window.xml'))
    except (subprocess.SubprocessError, OSError):
        pass
    raise
