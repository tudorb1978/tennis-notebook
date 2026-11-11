import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = path.join(root, 'src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

interface Dependency { target: string; names: string[] }
function dependencies(file: string): Dependency[] {
  const result: Dependency[] = [];
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const add = (specifier: ts.Node | undefined, names: string[] = []) => {
    if (specifier && ts.isStringLiteralLike(specifier)) {
      result.push({ target: specifier.text.startsWith('.') ? path.resolve(path.dirname(file), specifier.text) : specifier.text, names });
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings;
      add(node.moduleSpecifier, bindings && ts.isNamedImports(bindings)
        ? bindings.elements.map(item => (item.propertyName ?? item.name).text) : []);
    } else if (ts.isExportDeclaration(node)) {
      const bindings = node.exportClause;
      add(node.moduleSpecifier, bindings && ts.isNamedExports(bindings)
        ? bindings.elements.map(item => (item.propertyName ?? item.name).text) : []);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

const files = [...sourceFiles(sourceRoot), path.join(root, 'App.tsx')];
const graph = files.map(file => ({ file, dependencies: dependencies(file) }));
const inDirectory = (target: string, directory: string) => target.startsWith(path.join(sourceRoot, directory) + path.sep);
const nativeDependency = (target: string) => /^(?:expo(?:-|\/|$)|@expo\/|react-native(?:-|\/|$))/.test(target);
const violation = (file: string, target: string) => `${path.relative(root, file)} imports ${path.isAbsolute(target) ? path.relative(root, target) : target}`;

test('Tennis domain depends only on other domain modules', () => {
  for (const { file, dependencies: imports } of graph.filter(module => inDirectory(module.file, 'domain'))) {
    for (const { target } of imports) assert.ok(inDirectory(target, 'domain'), violation(file, target));
  }
});

test('Persistence models and repository remain independent of UI and platform libraries', () => {
  for (const { file, dependencies: imports } of graph.filter(module => inDirectory(module.file, 'storage')
    && path.basename(module.file) !== 'database.ts')) {
    for (const { target } of imports) {
      assert.ok(inDirectory(target, 'domain') || (inDirectory(target, 'storage') && path.basename(target) !== 'database.ts'), violation(file, target));
    }
  }
});

test('Application operations and controller do not depend on layout or native adapters', () => {
  for (const { file, dependencies: imports } of graph.filter(module => inDirectory(module.file, 'application'))) {
    for (const { target } of imports) {
      assert.ok(!inDirectory(target, 'ui') && !inDirectory(target, 'platform') && !nativeDependency(target), violation(file, target));
      assert.notEqual(target, path.join(sourceRoot, 'storage/database.ts'), violation(file, target));
      assert.notEqual(target, path.join(sourceRoot, 'reports/files.ts'), violation(file, target));
      if (target === 'react' || target.startsWith('react/')) {
        assert.equal(path.basename(file), 'useNotebook.ts', `React belongs only in the controller hook: ${violation(file, target)}`);
      }
    }
  }
});

test('Views use application commands rather than repositories or history mutations', () => {
  for (const { file, dependencies: imports } of graph.filter(module => inDirectory(module.file, 'ui') || module.file === path.join(root, 'App.tsx'))) {
    for (const { target, names } of imports) {
      assert.notEqual(target, path.join(sourceRoot, 'storage/database.ts'), violation(file, target));
      assert.notEqual(target, path.join(sourceRoot, 'storage/repository.ts'), violation(file, target));
      assert.notEqual(target, path.join(sourceRoot, 'reports/files.ts'), violation(file, target));
      if (target === path.join(sourceRoot, 'domain/history.ts')) {
        assert.ok(!names.some(name => name === 'appendEvent' || name === 'undoLast'), `History mutations belong in application commands: ${violation(file, target)}`);
      }
      if (inDirectory(target, 'platform')) {
        assert.equal(file, path.join(root, 'App.tsx'), `Only the composition root wires platform adapters: ${violation(file, target)}`);
      }
    }
  }
});

test('Report calculations and PDF generation stay independent of screens and native file sharing', () => {
  for (const { file, dependencies: imports } of graph.filter(module => inDirectory(module.file, 'reports')
    && path.basename(module.file) !== 'files.ts')) {
    for (const { target } of imports) {
      assert.ok(!inDirectory(target, 'ui') && !inDirectory(target, 'application') && !inDirectory(target, 'platform')
        && !nativeDependency(target) && target !== 'react', violation(file, target));
      assert.notEqual(target, path.join(sourceRoot, 'reports/files.ts'), violation(file, target));
      assert.notEqual(target, path.join(sourceRoot, 'storage/database.ts'), violation(file, target));
    }
  }
});

test('Native persistence and file sharing are wired only by the platform composition module', () => {
  for (const { file, dependencies: imports } of graph) {
    for (const { target } of imports) {
      if (target === path.join(sourceRoot, 'storage/database.ts') || target === path.join(sourceRoot, 'reports/files.ts')) {
        assert.equal(file, path.join(sourceRoot, 'platform/notebookDependencies.ts'), violation(file, target));
      }
    }
  }
});
