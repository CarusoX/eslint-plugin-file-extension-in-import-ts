const fs = require('node:fs');
const path = require('node:path');

const getTryExtensions = require('../util/get-try-extensions');
const mappingExtensions = require('../util/mapping-extensions');
const visitImport = require('../util/visit-import');

const packageNamePattern = /^(?:@[^/\\]+[/\\])?[^/\\]+$/u;
const corePackageOverridePattern =
  /^(?:assert|async_hooks|buffer|child_process|cluster|console|constants|crypto|dgram|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|worker_threads|zlib)[/\\]$/u;

/**
 * Get all file extensions of the files which have the same basename.
 * @param {string} filePath The path to the original file to check.
 * @returns {string[]} File extensions.
 */
function getExistingExtensions(filePath) {
  const basename = path.basename(filePath, path.extname(filePath));
  try {
    return fs
      .readdirSync(path.dirname(filePath))
      .filter((filename) => path.basename(filename, path.extname(filename)) === basename)
      .map((filename) => path.extname(filename));
  } catch (_error) {
    return [];
  }
}

module.exports = {
  create(context) {
    if (context.getFilename().startsWith('<')) {
      return {};
    }
    const defaultStyle = context.options[0] || 'always';
    const overrideStyle = context.options[1] || {};
    const extMapping = overrideStyle.extMapping || mappingExtensions.mappingDefault;

    function verify({ filePath, name, node }) {
      // Ignore if it's not resolved to a file or it's a bare module.
      if (!filePath || packageNamePattern.test(name) || corePackageOverridePattern.test(name)) {
        return;
      }

      // Get extension.
      const originalExt = path.extname(name);
      const resolvedExt = path.extname(filePath);
      const existingExts = getExistingExtensions(filePath);
      if (!resolvedExt && existingExts.length !== 1) {
        // Ignore if the file extension could not be determined one.
        return;
      }
      const ext = mappingExtensions(resolvedExt || existingExts[0], extMapping);
      const style = overrideStyle[ext] || defaultStyle;
      // Verify.
      if (style === 'always' && ext !== originalExt) {
        context.report({
          data: { ext },
          fix(fixer) {
            if (existingExts.length !== 1) {
              return null;
            }
            const index = node.range[1] - 1;

            return fixer.insertTextBeforeRange([index, index], ext);
          },
          messageId: 'requireExt',
          node,
        });
      } else if (style === 'never' && ext === originalExt) {
        context.report({
          data: { ext },
          fix(fixer) {
            if (existingExts.length !== 1) {
              return null;
            }
            const index = name.lastIndexOf(ext);
            const start = node.range[0] + 1 + index;
            const end = start + ext.length;

            return fixer.removeRange([start, end]);
          },
          messageId: 'forbidExt',
          node,
        });
      }
    }

    return visitImport(context, { optionIndex: 1 }, (targets) => {
      targets.forEach(verify);
    });
  },
  meta: {
    docs: {
      category: 'Stylistic Issues',
      description: 'enforce the style of file extensions in `import` declarations',
      recommended: false,
      url: 'https://github.com/mysticatea/eslint-plugin-node/blob/v11.1.0/docs/rules/file-extension-in-import.md',
    },
    fixable: 'code',
    messages: {
      forbidExt: "forbid file extension '{{ext}}'.",
      requireExt: "require file extension '{{ext}}'.",
    },
    schema: [
      {
        enum: ['always', 'never'],
      },
      {
        additionalProperties: {
          enum: ['always', 'never'],
        },
        properties: {
          extMapping: mappingExtensions.schema,
          tryExtensions: getTryExtensions.schema,
        },
        type: 'object',
      },
    ],
    type: 'suggestion',
  },
};
