import fetch from '@pnpm/fetch'
import {
  FetchPackageToStoreOptions,
  PackageFilesResponse,
  PackageResponse,
  PackageUsagesBySearchQueries,
  RequestPackageOptions,
  StoreController,
  WantedDependency,
} from '@pnpm/store-controller-types'
import { PackageJson } from '@pnpm/types'

import pLimit from 'p-limit'
import uuid = require('uuid')

export type StoreServerController = StoreController & {
  stop (): Promise<void>,
}

export default function (
  initOpts: {
    remotePrefix: string,
    concurrency?: number,
  },
): Promise<StoreServerController> {
  const remotePrefix = initOpts.remotePrefix
  const limitedFetch = limitFetch.bind(null, pLimit(initOpts.concurrency || 100))

  return new Promise((resolve, reject) => {
    resolve({
      close: async () => { return },
      fetchPackage: fetchPackage.bind(null, remotePrefix, limitedFetch),
      findPackageUsages: async (searchQueries: string[]): Promise<PackageUsagesBySearchQueries> => {
        return await limitedFetch(`${remotePrefix}/findPackageUsages`, { searchQueries }) as PackageUsagesBySearchQueries
      },
      getPackageLocation: async (
        packageId: string,
        packageName: string,
        opts: {
          lockfileDirectory: string,
          targetEngine?: string,
        },
      ): Promise<{ directory: string, isBuilt: boolean }> => {
        return await limitedFetch(`${remotePrefix}/getPackageLocation`, {
          opts,
          packageId,
          packageName,
        }) as { directory: string, isBuilt: boolean }
      },
      importPackage: async (from: string, to: string, opts: {
        filesResponse: PackageFilesResponse,
        force: boolean,
      }) => {
        await limitedFetch(`${remotePrefix}/importPackage`, {
          from,
          opts,
          to,
        })
      },
      prune: async () => {
        await limitedFetch(`${remotePrefix}/prune`, {})
      },
      requestPackage: requestPackage.bind(null, remotePrefix, limitedFetch),
      saveState: async () => {
        await limitedFetch(`${remotePrefix}/saveState`, {})
      },
      stop: async () => { await limitedFetch(`${remotePrefix}/stop`, {}) },
      updateConnections: async (prefix: string, opts: {addDependencies: string[], removeDependencies: string[], prune: boolean}) => {
        await limitedFetch(`${remotePrefix}/updateConnections`, {
          opts,
          prefix,
        })
      },
      upload: async (builtPkgLocation: string, opts: {packageId: string, engine: string}) => {
        await limitedFetch(`${remotePrefix}/upload`, {
          builtPkgLocation,
          opts,
        })
      },
    })
  })
}

function limitFetch<T>(limit: (fn: () => PromiseLike<T>) => Promise<T>, url: string, body: object): Promise<T> { // tslint:disable-line
  return limit(async () => {
    // TODO: the http://unix: should be also supported by the fetcher
    // but it fails with node-fetch-unix as of v2.3.0
    if (url.startsWith('http://unix:')) {
      url = url.replace('http://unix:', 'unix:')
    }
    const response = await fetch(url, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      retry: {
        retries: 100,
      },
    })
    if (!response.ok) {
      throw await response.json()
    }
    const json = await response.json()
    if (json.error) {
      throw json.error
    }
    return json as T
  })
}

function requestPackage (
  remotePrefix: string,
  limitedFetch: (url: string, body: object) => any, // tslint:disable-line
  wantedDependency: WantedDependency,
  options: RequestPackageOptions,
): Promise<PackageResponse> {
  const msgId = uuid.v4()

  return limitedFetch(`${remotePrefix}/requestPackage`, {
    msgId,
    options,
    wantedDependency,
  })
  .then((packageResponseBody: object) => {
    const fetchingRawManifest = !packageResponseBody['fetchingRawManifestInProgress'] // tslint:disable-line
      ? undefined
      : limitedFetch(`${remotePrefix}/rawManifestResponse`, {
        msgId,
      })
    delete packageResponseBody['fetchingRawManifestInProgress'] // tslint:disable-line

    if (options.skipFetch) {
      return {
        body: packageResponseBody,
        fetchingRawManifest,
      }
    }

    const fetchingFiles = limitedFetch(`${remotePrefix}/packageFilesResponse`, {
      msgId,
    })
    return {
      body: packageResponseBody,
      fetchingFiles,
      fetchingRawManifest,
      finishing: Promise.all([fetchingRawManifest, fetchingFiles]).then(() => undefined),
    }
  })
}

function fetchPackage (
  remotePrefix: string,
  limitedFetch: (url: string, body: object) => any, // tslint:disable-line
  options: FetchPackageToStoreOptions,
): {
  fetchingFiles: Promise<PackageFilesResponse>,
  fetchingRawManifest?: Promise<PackageJson>,
  finishing: Promise<void>,
  inStoreLocation: string,
} {
  const msgId = uuid.v4()

  return limitedFetch(`${remotePrefix}/fetchPackage`, {
    msgId,
    options,
  })
  .then((fetchResponseBody: object & {inStoreLocation: string}) => {
    const fetchingRawManifest = options.fetchRawManifest
      ? limitedFetch(`${remotePrefix}/rawManifestResponse`, { msgId })
      : undefined

    const fetchingFiles = limitedFetch(`${remotePrefix}/packageFilesResponse`, {
      msgId,
    })
    return {
      fetchingFiles,
      fetchingRawManifest,
      finishing: Promise.all([fetchingRawManifest, fetchingFiles]).then(() => undefined),
      inStoreLocation: fetchResponseBody.inStoreLocation,
    }
  })
}
