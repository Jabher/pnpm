import fs = require('mz/fs')
import tape = require('tape')
import promisifyTape from 'tape-promise'
import path = require('path')
import writeYamlFile = require('write-yaml-file')
import {
  preparePackages,
  execPnpm,
 } from '../utils'

const test = promisifyTape(tape)

test('linking a package inside a monorepo', async (t: tape.Test) => {
  const projects = preparePackages(t, [
    {
      name: 'project-1',
      version: '1.0.0',
    },
    {
      name: 'project-2',
      version: '2.0.0',
    },
    {
      name: 'project-3',
      version: '3.0.0',
    },
    {
      name: 'project-4',
      version: '4.0.0',
    },
  ])

  await writeYamlFile('pnpm-workspace.yaml', {packages: ['**', '!store/**']})

  process.chdir('project-1')

  await execPnpm('link', 'project-2')

  await execPnpm('link', 'project-3', '--save-dev')

  await execPnpm('link', 'project-4', '--save-optional')

  const pkg = await import(path.resolve('package.json'))

  t.deepEqual(pkg && pkg.dependencies, {'project-2': '^2.0.0'}, 'spec of linked package added to dependencies')
  t.deepEqual(pkg && pkg.devDependencies, {'project-3': '^3.0.0'}, 'spec of linked package added to devDependencies')
  t.deepEqual(pkg && pkg.optionalDependencies, {'project-4': '^4.0.0'}, 'spec of linked package added to optionalDependencies')

  await projects['project-1'].has('project-2')
  await projects['project-1'].has('project-3')
  await projects['project-1'].has('project-4')
})

test('linking a package inside a monorepo with --link-workspace-packages when installing new dependencies', async (t: tape.Test) => {
  const projects = preparePackages(t, [
    {
      name: 'project-1',
      version: '1.0.0',
    },
    {
      name: 'project-2',
      version: '2.0.0',
    },
    {
      name: 'project-3',
      version: '3.0.0',
    },
    {
      name: 'project-4',
      version: '4.0.0',
    },
  ])

  await fs.writeFile('.npmrc', 'link-workspace-packages = true', 'utf8')
  await writeYamlFile('pnpm-workspace.yaml', {packages: ['**', '!store/**']})

  process.chdir('project-1')

  await execPnpm('install', 'project-2')

  await execPnpm('install', 'project-3', '--save-dev')

  await execPnpm('install', 'project-4', '--save-optional')

  const pkg = await import(path.resolve('package.json'))

  t.deepEqual(pkg && pkg.dependencies, {'project-2': '^2.0.0'}, 'spec of linked package added to dependencies')
  t.deepEqual(pkg && pkg.devDependencies, {'project-3': '^3.0.0'}, 'spec of linked package added to devDependencies')
  t.deepEqual(pkg && pkg.optionalDependencies, {'project-4': '^4.0.0'}, 'spec of linked package added to optionalDependencies')

  await projects['project-1'].has('project-2')
  await projects['project-1'].has('project-3')
  await projects['project-1'].has('project-4')
})

test('linking a package inside a monorepo with --link-workspace-packages', async (t: tape.Test) => {
  const projects = preparePackages(t, [
    {
      name: 'project-1',
      version: '1.0.0',
      dependencies: {
        'json-append': '1',
        'project-2': '2.0.0',
      },
      devDependencies: {
        'is-negative': '100.0.0',
      },
      optionalDependencies: {
        'is-positive': '1.0.0',
      },
      scripts: {
        install: `node -e "process.stdout.write('project-1')" | json-append ../output.json`,
      },
    },
    {
      name: 'project-2',
      version: '2.0.0',
      dependencies: {
        'json-append': '1',
      },
      scripts: {
        install: `node -e "process.stdout.write('project-2')" | json-append ../output.json`,
      },
    },
    {
      name: 'is-negative',
      version: '100.0.0',
    },
    {
      name: 'is-positive',
      version: '1.0.0',
    },
  ])

  await fs.writeFile('.npmrc', 'link-workspace-packages = true', 'utf8')
  await writeYamlFile('pnpm-workspace.yaml', {packages: ['**', '!store/**']})

  process.chdir('project-1')

  await execPnpm('install')

  const outputs = await import(path.resolve('..', 'output.json')) as string[]
  t.deepEqual(outputs, ['project-2', 'project-1'])

  await projects['project-1'].has('project-2')
  await projects['project-1'].has('is-negative')
  await projects['project-1'].has('is-positive')

  {
    const shr = await projects['project-1'].loadShrinkwrap()
    t.equal(shr.dependencies['project-2'], 'link:../project-2')
    t.equal(shr.devDependencies['is-negative'], 'link:../is-negative')
    t.equal(shr.optionalDependencies['is-positive'], 'link:../is-positive')
  }

  projects['is-positive'].writePackageJson({
    name: 'is-positive',
    version: '2.0.0',
  })

  await execPnpm('install')

  {
    const shr = await projects['project-1'].loadShrinkwrap()
    t.equal(shr.optionalDependencies['is-positive'], '1.0.0', 'is-positive is unlinked and installed from registry')
  }

  await execPnpm('update', 'is-negative@2.0.0')

  {
    const shr = await projects['project-1'].loadShrinkwrap()
    t.equal(shr.devDependencies['is-negative'], '2.0.0')
  }
})

test('topological order of packages with self-dependencies in monorepo is correct', async (t: tape.Test) => {
  preparePackages(t, [
    {
      name: 'project-1',
      version: '1.0.0',
      dependencies: { 'project-2': '1.0.0', 'project-3': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        install: `node -e "process.stdout.write('project-1')" | json-append ../output.json`,
        test: `node -e "process.stdout.write('project-1')" | json-append ../output2.json`,
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',
      dependencies: { 'project-2': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        install: `node -e "process.stdout.write('project-2')" | json-append ../output.json`,
        test: `node -e "process.stdout.write('project-2')" | json-append ../output2.json`,
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',
      dependencies: { 'project-2': '1.0.0', 'project-3': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        install: `node -e "process.stdout.write('project-3')" | json-append ../output.json`,
        test: `node -e "process.stdout.write('project-3')" | json-append ../output2.json`,
      },
    },
  ]);
  await fs.writeFile('.npmrc', 'link-workspace-packages = true', 'utf8')
  await writeYamlFile('pnpm-workspace.yaml', { packages: ['**', '!store/**'] })

  process.chdir('project-1')

  await execPnpm('install')

  const outputs = await import(path.resolve('..', 'output.json')) as string[]
  t.deepEqual(outputs, ['project-2', 'project-3', 'project-1'])

  await execPnpm('recursive', 'test')

  const outputs2 = await import(path.resolve('..', 'output2.json')) as string[]
  t.deepEqual(outputs2, ['project-2', 'project-3', 'project-1'])

})

test('do not get confused by filtered dependencies when searching for dependents in monorepo', async (t: tape.Test) => {
  /*
   In this test case, we are filtering for 'project-2' and its dependents with
   two projects in the dependency hierarchy, that can be ignored for this query,
   as they do not depend on 'project-2'.
  */
  preparePackages(t, [
    {
      name: 'unused-project-1',
      version: '1.0.0',
    },
    {
      name: 'unused-project-2',
      version: '1.0.0',
    },
    {
      name: 'project-2',
      version: '1.0.0',
      dependencies: { 'unused-project-1': '1.0.0', 'unused-project-2': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        test: `node -e "process.stdout.write('project-2')" | json-append ../output.json`,
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',
      dependencies: { 'project-2': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        test: `node -e "process.stdout.write('project-3')" | json-append ../output.json`,
      },
    },
    {
      name: 'project-4',
      version: '1.0.0',
      dependencies: { 'project-2': '1.0.0', 'unused-project-1': '1.0.0', 'unused-project-2': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        test: `node -e "process.stdout.write('project-4')" | json-append ../output.json`,
      },
    },
  ]);
  await fs.writeFile('.npmrc', 'link-workspace-packages = true', 'utf8')
  await writeYamlFile('pnpm-workspace.yaml', { packages: ['**', '!store/**'] })

  await execPnpm('install')

  process.chdir('project-2')

  await execPnpm('recursive', '--filter=...project-2', 'run', 'test')

  const outputs = await import(path.resolve('..', 'output.json')) as string[]
  // project-2 should be executed first, we cannot say anything about the order
  // of the last two packages.
  t.equal(outputs[0], 'project-2')

})
// TODO: make it pass
test['skip']('installation with --link-workspace-packages links packages even if they were previously installed from registry', async (t: tape.Test) => {
  const projects = preparePackages(t, [
    {
      name: 'project',
      version: '1.0.0',
      dependencies: {
        'is-positive': '2.0.0',
      },
    },
    {
      name: 'is-positive',
      version: '2.0.0',
    },
  ])

  await execPnpm('recursive', 'install', '--no-link-workspace-packages')

  {
    const shr = await projects['project'].loadShrinkwrap()
    t.equal(shr.dependencies['is-positive'], '2.0.0')
  }

  await execPnpm('recursive', 'install', '--link-workspace-packages')

  {
    const shr = await projects['project'].loadShrinkwrap()
    t.equal(shr.dependencies['is-positive'], 'link:../is-positive')
  }
})
