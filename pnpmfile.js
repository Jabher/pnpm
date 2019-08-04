module.exports = {
  hooks: {
    readPackage (pkg) {
      if (pkg.dependencies['@nodelib/fs.walk'] === '^1.1.0') {
        pkg.dependencies['@nodelib/fs.walk'] = '1.1.1'
      }
      if (pkg.name === 'verdaccio') {
        pkg.dependencies = {
          ...pkg.dependencies,
          'http-errors': '^1.7.3',
          'request': '^2.88.0',
        }
      }
      return pkg
    }
  }
}
