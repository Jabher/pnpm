import { packageJsonLogger } from '@pnpm/core-loggers'
import {
  DEPENDENCIES_FIELDS,
  DependenciesField,
  PackageJson,
} from '@pnpm/types'
import loadJsonFile from 'load-json-file'
import path = require('path')
import writePkg = require('write-pkg')

export default async function save (
  prefix: string,
  packageSpecs: Array<{
    name: string,
    pref?: string,
    saveType?: DependenciesField,
  }>,
  opts?: {
    dryRun?: boolean,
  }
): Promise<PackageJson> {
  // Read the latest version of package.json to avoid accidental overwriting
  let packageJson: object
  const pkgJsonPath = path.join(prefix, 'package.json')
  try {
    packageJson = await loadJsonFile<PackageJson>(pkgJsonPath)
  } catch (err) {
    if (err['code'] !== 'ENOENT') throw err // tslint:disable-line:no-string-literal
    packageJson = {}
  }
  packageSpecs.forEach((packageSpec) => {
    if (packageSpec.saveType) {
      const saveType = packageSpec.saveType
      packageJson[packageSpec.saveType] = packageJson[packageSpec.saveType] || {}
      packageJson[saveType][packageSpec.name] = packageSpec.pref || findSpec(packageSpec.name, packageJson as PackageJson)
      DEPENDENCIES_FIELDS.filter((depField) => depField !== packageSpec.saveType).forEach((deptype) => {
        if (packageJson[deptype]) {
          delete packageJson[deptype][packageSpec.name]
        }
      })
    } else {
      const usedDepType = guessDependencyType(packageSpec.name, packageJson as PackageJson) || 'dependencies'
      packageJson[usedDepType] = packageJson[usedDepType] || {}
      packageJson[usedDepType][packageSpec.name] = packageSpec.pref
    }
  })

  if (!opts || opts.dryRun !== true) {
    await writePkg(pkgJsonPath, packageJson)
  }
  packageJsonLogger.debug({
    prefix,
    updated: packageJson,
  })
  return packageJson as PackageJson
}

function findSpec (depName: string, pkg: PackageJson): string | undefined {
  const foundDepType = guessDependencyType(depName, pkg)
  return foundDepType && pkg[foundDepType]![depName]
}

export function guessDependencyType (depName: string, pkg: PackageJson): DependenciesField | undefined {
  return DEPENDENCIES_FIELDS
    .find((depField) => Boolean(pkg[depField] && pkg[depField]![depName]))
}
