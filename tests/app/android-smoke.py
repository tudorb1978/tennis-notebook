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
package = 'uk.tennistracker.app'

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

def capture(name):
    Path(args.output, name).write_bytes(run('exec-out', 'screencap', '-p', binary=True))

def wait_for_pdf_chooser(report):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        items = nodes()
        app_text = '\n'.join(
            n.attrib.get('text') or n.attrib.get('content-desc', '')
            for n in items if n.attrib.get('package') == package
        )
        if any(message in app_text for message in (
            'URI is not absolute', 'FileSystemFile.bytes', 'Could not load a report asset',
        )):
            raise AssertionError(f'{report} PDF export failed:\n{app_text}')
        if any(
            'intentresolver' in n.attrib.get('package', '')
            or 'Chooser' in n.attrib.get('class', '')
            or (n.attrib.get('package') != package and 'Sharing' in n.attrib.get('text', ''))
            for n in items
        ):
            return
        time.sleep(.3)
    raise AssertionError(f'{report} PDF export did not open Android’s share chooser within 60 seconds:\n{app_text}')

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
    tap(resource='ending-0-winner')
    wait_for(text='Which stroke?')
    tap(resource='stroke-forehand')
    wait_for(text='15')
    capture('tennis-native-recording.png')
    print('PASS Standalone APK launches, opens native SQLite, and records a forehand winner', flush=True)

    tap(resource='point-winner-0', scroll=True)
    tap(resource='ending-0-winner')
    wait_for(text='Which stroke?')
    run('shell', 'svc', 'wifi', 'disable')
    run('shell', 'svc', 'data', 'disable')
    run('shell', 'am', 'force-stop', package)
    run('shell', 'am', 'start', '-n', package+'/.MainActivity')
    wait_for(text='Which stroke?')
    wait_for(text='15')
    tap(resource='stroke-backhand')
    wait_for(text='30')
    print('PASS Cold start without network restores the score and pending stroke; recording continues', flush=True)

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
    tap(text='Serves + endings', scroll=True)
    wait_for(resource='first-fault')
    tap(resource='first-fault')
    tap(resource='second-in')
    tap(resource='point-winner-0', scroll=True)
    tap(resource='ending-1-unforced-error', scroll=True)
    tap(resource='stroke-backhand')
    wait_for(text='40')
    wait_for(resource='undo')
    print('PASS Detailed serve recording works natively and Undo stays available in the bottom bar', flush=True)

    tap(text='Pause', scroll=True)
    wait_for(text='Match paused')
    tap(resource='tab-report')
    for variant in ('summary', 'point-by-point', 'combined'):
        tap(resource='match-pdf-export', scroll=True)
        wait_for(text='Export match PDF')
        tap(resource=f'match-pdf-{variant}')
        wait_for_pdf_chooser(f'Match {variant}')
        capture(f'tennis-native-{variant}-share.png')
        run('shell', 'input', 'keyevent', '4')
        wait_for(resource='match-pdf-export')
        print(f'PASS Offline {variant} PDF opens Android’s share chooser', flush=True)
    capture('tennis-native-report.png')

    tap(resource='back-to-matches')
    tap(text='Player performance', scroll=True)
    tap(text='Export player PDF', scroll=True)
    wait_for_pdf_chooser('Player performance')
    capture('tennis-native-player-share.png')
    run('shell', 'input', 'keyevent', '4')
    wait_for(text='Export player PDF')
    print('PASS Offline player PDF opens Android’s share chooser', flush=True)
except Exception:
    try:
        capture('tennis-native-failure.png')
        Path(args.output, 'tennis-native-failure.xml').write_text(run('exec-out', 'cat', '/sdcard/tennis-test-window.xml'))
    except (subprocess.SubprocessError, OSError):
        pass
    raise
