import { DependenciesField, Registries } from '@pnpm/types'
import path = require('path')
import readYamlFile from 'read-yaml-file'
import writeYamlFile = require('write-yaml-file')

// The dot prefix is needed because otherwise `npm shrinkwrap`
// thinks that it is an extraneous package.
const MODULES_FILENAME = '.modules.yaml'

export type IncludedDependencies = {
  [dependenciesField in DependenciesField]: boolean
}

export interface Modules {
  hoistedAliases: {[depPath: string]: string[]}
  shamefullyFlatten: boolean,
  included: IncludedDependencies,
  independentLeaves: boolean,
  layoutVersion: number,
  packageManager: string,
  pendingBuilds: string[],
  registries?: Registries, // nullable for backward compatibility
  skipped: string[],
  store: string,
}

export async function read (virtualStoreDir: string): Promise<Modules | null> {
  const modulesYamlPath = path.join(virtualStoreDir, MODULES_FILENAME)
  try {
    const m = await readYamlFile<Modules>(modulesYamlPath)
    // for backward compatibility
    // tslint:disable:no-string-literal
    if (m['storePath']) {
      m.store = m['storePath']
      delete m['storePath']
    }
    if (!m.hoistedAliases && m['importers'] && m['importers']['.']) {
      m.hoistedAliases = m['importers']['.']['hoistedAliases']
      m.shamefullyFlatten = m['importers']['.']['shamefullyFlatten']
      delete m['importers']
    }
    // tslint:enable:no-string-literal
    return m
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
    return null
  }
}

const YAML_OPTS = { sortKeys: true }

export function write (
  virtualStoreDir: string,
  modules: Modules & { registries: Registries },
) {
  const modulesYamlPath = path.join(virtualStoreDir, MODULES_FILENAME)
  if (modules['skipped']) modules['skipped'].sort() // tslint:disable-line:no-string-literal

  return writeYamlFile(modulesYamlPath, modules, YAML_OPTS)
}
