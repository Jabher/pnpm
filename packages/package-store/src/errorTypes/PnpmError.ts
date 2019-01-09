export type PnpmErrorCode = 'UNEXPECTED_STORE'
| 'STORE_BREAKING_CHANGE'
| 'MODULES_BREAKING_CHANGE'
| 'SHRINKWRAP_BREAKING_CHANGE'
| 'MODIFIED_DEPENDENCY'
| 'NO_OFFLINE_META'

export default class PnpmError extends Error {
  public code: PnpmErrorCode
  constructor (code: PnpmErrorCode, message: string) {
    super(message)
    this.code = code
  }
}
