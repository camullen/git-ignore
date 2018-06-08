#!/usr/bin/env node

const path = require('path');
const klaw = require('klaw');
const caporal = require('caporal');
const fs = require('fs-extra');
const _ = require('lodash');

const { version: APP_VERSION } = require('./package.json');

const TEMPLATES_PATH = path.resolve(__dirname, 'gitignoreTemplates');

const isGitignore = pathStr => {
  if (pathStr === TEMPLATES_PATH) return false;
  const ext = path.extname(pathStr);

  const matches = ext == '.gitignore';

  // console.log('Path: ', pathStr, ' ext: ', ext, ' matches: ', matches);

  return matches;
};

const getFilename = pathStr => {
  return path.basename(pathStr, path.extname(pathStr));
};

// const gitignoreName = item => {
//   return getFilename(item.path);
// };

const frameComment = commentStr => {
  commentStr = '# ' + commentStr.trim();
  const commentLen = commentStr.length;
  if (commentLen >= 79) {
    return commentStr;
  }
  const numSpaces = 79 - commentLen;
  commentStr += ' '.repeat(numSpaces) + '#';
  return commentStr;
};

const nowUTCString = () => new Date().toUTCString();

class Gitignore {
  constructor({ srcPath }) {
    this._path = srcPath;
    this._name = getFilename(srcPath);
    this._contentsGet = _.memoize(() => {
      return fs.readFileSync(this.path, { encoding: 'utf8' });
    });
  }

  get path() {
    return this._path;
  }

  get name() {
    return this._name;
  }

  get contents() {
    return this._contentsGet();
  }

  get preamble() {
    const hashRow = '#'.repeat(80) + '\n';
    const comments = [
      `Added by git-ignore utility on ${nowUTCString()}`,
      '',
      'Language: ' + this.name
    ];

    return (
      '\n'.repeat(3) +
      hashRow +
      comments.map(frameComment).join('\n') +
      '\n' +
      hashRow +
      '\n'.repeat(3)
    );
  }

  get appendContent() {
    return this.preamble + this.contents;
  }

  appendToFile({ destPath }) {
    fs.appendFileSync(destPath, this.appendContent);
  }
}

const loadLanguageMap = () => {
  return new Promise((resolve, reject) => {
    const data = new Map();

    klaw(TEMPLATES_PATH, { filter: isGitignore })
    .on('data', item => {
      const gitignore = new Gitignore({ srcPath: item.path });
      data.set(gitignore.name, gitignore);
    })
    .on('end', () => {
      resolve(data);
    })
    .on('error', e => reject(e));
  });
};

const genAliasesFromUpperCamel = name => {
  return [
    _.camelCase(name),
    _.kebabCase(name),
    _.upperCase(_.kebabCase(name)),
    _.snakeCase(name),
    _.upperCase(_.snakeCase(name)),
  ];
}

const getLanguageMap = _.memoize(loadLanguageMap);

// const nodeGitignorePath = path.resolve(TEMPLATES_PATH, 'Node.gitignore');

// const nodeGitignore = new Gitignore({ srcPath: nodeGitignorePath });
// const destPath = path.resolve(__dirname, 'test.gitignore');

// nodeGitignore.appendToFile({ destPath });

const loadLanguageAliases = async () => {
  const languageMap = await getLanguageMap();

  const aliasMap = new Map();

  for (let name of languageMap.keys()) {
    const aliases = genAliasesFromUpperCamel(name);
    for (let alias of aliases) {
      aliasMap.set(alias, name);
    }
    aliasMap.set(name, name);
  }

  return aliasMap
}

const getLanguageAliases = _.memoize(loadLanguageAliases);

const getAllLanguageNames = _.memoize(async () => {
  const aliasMap = await getLanguageAliases();
  return Array.from(aliasMap.keys());
});


const runFunc = async () => {

  const allLanguageNames = await getAllLanguageNames();
  caporal
    .name('git-ignore')
    .version(APP_VERSION)
    .description(
      'A program that adds entries to your .gitignore from various sources'
    )
    .argument('<language>', 'The language of the gitignore to append', allLanguageNames)
    .complete(getAllLanguageNames)
    .option(
      '-O, --out <path>',
      'The path of the gitignore file to append to', null,
      './.gitignore'
    )
    .action(async (args, options, logger) => {
      const lang = args.language;
      const destPath = options.out;
      const aliases = await getLanguageAliases()
      const canonicalName = aliases.get(lang);
      const languageMap = await getLanguageMap()
      const gitignore = languageMap.get(canonicalName);
      gitignore.appendToFile({destPath})
    });

  caporal.parse(process.argv);
}

runFunc();
