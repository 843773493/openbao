import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localeRoot = path.join(uiRoot, 'app/locales');
const ignoredTags = new Set(['code', 'pre', 'script', 'style', 'textarea', 'kbd', 'samp']);
const voidTags = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const translatedAttributes = new Set([
  'alt',
  'aria-description',
  'aria-label',
  '@buttontext',
  '@actiontext',
  '@arialabel',
  '@cardtitle',
  '@cancelbuttontext',
  '@closedlabel',
  '@confirmbuttontext',
  '@confirmmessage',
  '@confirmtitle',
  '@disabledtooltipmessage',
  '@description',
  '@doctext',
  '@error',
  '@errormessage',
  '@heading',
  '@headertext',
  '@helpertextdisabled',
  '@helpertextenabled',
  '@helpertext',
  '@hint',
  '@instructions',
  '@itemnoun',
  '@label',
  '@message',
  '@modalsubtext',
  '@noun',
  '@openlabel',
  '@placeholder',
  '@rendergroup',
  '@savebuttontext',
  '@searchlabel',
  '@subtext',
  '@subtitle',
  '@text',
  '@title',
  '@toconfirmmsg',
  '@tooltiptext',
  '@triggertext',
  'placeholder',
  'title',
]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi, (entity) => {
    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&nbsp;': '\u00a0',
      '&#39;': "'",
      '&#x27;': "'",
    };
    return entities[entity.toLowerCase()];
  });
}

function hasWords(text) {
  return /[A-Za-z]{2}/.test(text) && !/^(?:OpenBao|English)$/i.test(text);
}

function hbsString(text) {
  return JSON.stringify(text);
}

function readMustacheEnd(source, start) {
  if (source.startsWith('{{!--', start)) {
    const end = source.indexOf('--}}', start + 5);
    return end < 0 ? source.length : end + 4;
  }
  if (source.startsWith('{{!', start)) {
    const end = source.indexOf('}}', start + 3);
    return end < 0 ? source.length : end + 2;
  }
  const triple = source.startsWith('{{{', start);
  let quote = '';
  let escaped = false;
  for (let index = start + 2; index < source.length - 1; index++) {
    const character = source[index];
    if (escaped) {
      escaped = false;
    } else if (character === '\\' && quote) {
      escaped = true;
    } else if (quote && character === quote) {
      quote = '';
    } else if (!quote && (character === '"' || character === "'" || character === '`')) {
      quote = character;
    } else if (!quote && source.startsWith(triple ? '}}}' : '}}', index)) {
      return index + (triple ? 3 : 2);
    }
  }
  return source.length;
}

function readTagEnd(source, start) {
  let quote = '';
  let escaped = false;
  for (let index = start + 1; index < source.length; index++) {
    if (source.startsWith('{{', index)) {
      index = readMustacheEnd(source, index) - 1;
      continue;
    }
    const character = source[index];
    if (escaped) {
      escaped = false;
    } else if (character === '\\' && quote) {
      escaped = true;
    } else if (quote && character === quote) {
      quote = '';
    } else if (!quote && (character === '"' || character === "'")) {
      quote = character;
    } else if (!quote && character === '>') {
      return index + 1;
    }
  }
  return source.length;
}

function translateText(text, messages) {
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const phrase = decodeEntities(match[2]).replace(/\s+/g, ' ').trim();
  if (!hasWords(phrase)) return text;
  messages.add(phrase);
  return `${match[1]}{{t ${hbsString(phrase)}}}${match[3]}`;
}

function translateDynamicMustache(mustache) {
  if (
    mustache.startsWith('{{{') ||
    mustache.startsWith('{{#') ||
    mustache.startsWith('{{/') ||
    mustache.startsWith('{{!')
  ) {
    return mustache;
  }
  const expression = mustache.slice(2, -2).trim();
  if (
    !expression ||
    expression.startsWith('t ') ||
    expression.startsWith('t(') ||
    expression.startsWith('else')
  ) {
    return mustache;
  }
  const simplePath = /^(?:this\.|@)?[\w@.-]+$/.test(expression);
  if (!simplePath) return mustache;
  if (
    !/(?:^|[.@])(?:label|labelString|helpText|helperText|description|tooltipText|displayName|title|message|error|errorMessage|successMessage|warning|subText|instructions|placeholder|confirmButtonText|cancelButtonText|buttonText|actionText|heading|header|headerText|text|cardTitle|confirmTitle|confirmMessage|modalSubtext|disabledTooltipMessage)$/.test(
      expression
    )
  ) {
    return mustache;
  }
  return `{{t ${expression}}}`;
}

function translateAttributes(tag, messages) {
  const edits = [];
  const attributePattern = /([:@A-Za-z][\w:@-]*)\s*=\s*("([^"\n]*)"|'([^'\n]*)')/g;
  for (const match of tag.matchAll(attributePattern)) {
    const name = match[1].toLowerCase();
    const rawValue = match[3] ?? match[4];
    const isSubmitValue = name === 'value' && /<input\b[^>]*\btype\s*=\s*["']submit["']/i.test(tag);
    if (!translatedAttributes.has(name) && !isSubmitValue) continue;
    const start = match.index + match[0].indexOf(match[2]);
    let phrase = '';
    const argumentsList = [];
    let cursor = 0;
    for (const dynamic of rawValue.matchAll(/\{\{/g)) {
      const dynamicStart = dynamic.index;
      const dynamicEnd = readMustacheEnd(rawValue, dynamicStart);
      const expression = rawValue.slice(dynamicStart + 2, dynamicEnd - 2).trim();
      if (
        !expression ||
        expression.startsWith('#') ||
        expression.startsWith('/') ||
        expression.startsWith('!')
      ) {
        phrase = '';
        break;
      }
      phrase += decodeEntities(rawValue.slice(cursor, dynamicStart));
      const argument = `arg${argumentsList.length}`;
      phrase += `{${argument}}`;
      argumentsList.push({ argument, expression });
      cursor = dynamicEnd;
    }
    if (!rawValue.includes('{{')) phrase = decodeEntities(rawValue);
    else if (phrase) phrase += decodeEntities(rawValue.slice(cursor));
    phrase = phrase.replace(/\s+/g, ' ').trim();
    if (!hasWords(phrase)) continue;
    messages.add(phrase);
    const argumentsText = argumentsList
      .map(({ argument, expression }) => ` ${argument}=(${expression})`)
      .join('');
    edits.push({
      start,
      end: start + match[2].length,
      replacement: `{{t ${hbsString(phrase)}${argumentsText}}}`,
    });
  }
  const dynamicAttributePattern = /([:@A-Za-z][\w:@-]*)\s*=\s*\{\{([\s\S]*?)\}\}/g;
  for (const match of tag.matchAll(dynamicAttributePattern)) {
    const name = match[1].toLowerCase();
    const expression = match[2].trim();
    if (!translatedAttributes.has(name)) continue;
    const start = match.index + match[0].indexOf('{{');
    const existingTranslation = expression.match(/^t\s+([\s\S]+)$/);
    const translatedValue = existingTranslation ? existingTranslation[1].trim() : expression;
    const simplePath = /^(?:this\.|@)?[\w@.-]+$/.test(translatedValue);
    const parenthesized = translatedValue.startsWith('(') && translatedValue.endsWith(')');
    const quoted = translatedValue.startsWith('"') || translatedValue.startsWith("'");
    if (existingTranslation && (simplePath || parenthesized || quoted)) continue;
    const argument = simplePath || parenthesized || quoted ? translatedValue : `(${translatedValue})`;
    edits.push({
      start,
      end: start + match[0].slice(match[0].indexOf('{{')).length,
      replacement: `{{t ${argument}}}`,
    });
  }
  return edits
    .sort((first, second) => first.start - second.start)
    .reduceRight((result, edit) => {
      return result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
    }, tag);
}

function transformTemplate(source, messages) {
  const output = [];
  const tagStack = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('{{', index)) {
      const end = readMustacheEnd(source, index);
      output.push(translateDynamicMustache(source.slice(index, end)));
      index = end;
      continue;
    }
    if (source.startsWith('<!--', index)) {
      const commentEnd = source.indexOf('-->', index + 4);
      const end = commentEnd < 0 ? source.length : commentEnd + 3;
      output.push(source.slice(index, end));
      index = end;
      continue;
    }
    if (source[index] === '<' && /^<\/?[:A-Za-z][\w:.-]*/.test(source.slice(index))) {
      const end = readTagEnd(source, index);
      let tag = source.slice(index, end);
      const match = tag.match(/^<(\/?)\s*([:A-Za-z][\w:.-]*)/);
      if (match) {
        const closing = Boolean(match[1]);
        const name = match[2].toLowerCase();
        if (closing) {
          const stackIndex = tagStack.lastIndexOf(name);
          if (stackIndex >= 0) tagStack.splice(stackIndex);
        } else {
          tag = translateAttributes(tag, messages);
          if (!voidTags.has(name) && !/\/\s*>$/.test(tag)) tagStack.push(name);
        }
      }
      output.push(tag);
      index = end;
      continue;
    }
    let end = source.length;
    const nextMustache = source.indexOf('{{', index);
    if (nextMustache >= 0) end = Math.min(end, nextMustache);
    const nextTag = source.indexOf('<', index);
    if (nextTag >= 0 && /^<\/?[:A-Za-z][\w:.-]*/.test(source.slice(nextTag))) end = Math.min(end, nextTag);
    const text = source.slice(index, end);
    output.push(tagStack.some((name) => ignoredTags.has(name)) ? text : translateText(text, messages));
    index = end;
  }
  return output.join('');
}

function addExistingMessages(source, messages) {
  for (const match of source.matchAll(/\{\{\s*t\s+("(?:\\.|[^"\\])*")/g)) {
    messages.add(JSON.parse(match[1]));
  }
  for (const match of source.matchAll(/\bset-flash-message\s+("(?:\\.|[^"\\])*")/g)) {
    messages.add(JSON.parse(match[1]));
  }
}

function addModelMessages(messages) {
  const modelDirectories = [path.join(uiRoot, 'app/models'), ...walk(path.join(uiRoot, 'lib'))];
  const propertyPattern =
    /\b(?:label|description|helpText|tooltipText|placeholder|message|title|successMessage|errorMessage)\s*:\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`([^`$]*)`)/g;
  for (const target of modelDirectories) {
    if (!target.endsWith('.js') && !target.endsWith('.ts')) continue;
    const source = fs.readFileSync(target, 'utf8');
    for (const match of source.matchAll(propertyPattern)) {
      const phrase = (match[1] ?? match[2] ?? match[3]).replace(/\s+/g, ' ').trim();
      if (hasWords(phrase)) messages.add(phrase);
    }
  }
  const dateFormatters = fs.readFileSync(
    path.join(uiRoot, 'lib/core/addon/utils/date-formatters.js'),
    'utf8'
  );
  const monthNames = dateFormatters.match(/ARRAY_OF_MONTHS\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
  for (const match of monthNames.matchAll(/'([^']+)'/g)) messages.add(match[1]);
}

function addFlashMessages(messages) {
  const sourceFiles = [path.join(uiRoot, 'app'), path.join(uiRoot, 'lib')].flatMap((directory) =>
    walk(directory).filter((target) => target.endsWith('.js'))
  );
  const messagePattern =
    /(?:flashMessages|flash)\.(?:success|danger|warning|info|error)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  const returnedMessagePattern =
    /^\s{2}(?:successMessage|errorMessage|getMessage)\([^)]*\)\s*\{([\s\S]*?)^\s{2}\},/gm;
  const returnLiteralPattern = /\breturn\s+(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  const runtimeMessagePattern =
    /^\s*(?:(?:const|let|var)\s+|this\.)?(?:error|errorBanner|errorMessage|invalidFormAlert|inlineFormAlert|emptyStateMessage|notConfiguredMessage|codeDelayMessage|invalidDate|alert|title|message|reason)\s*=\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/gm;
  const conditionalReasonPattern =
    /\b(?:const|let|var)\s+reason\s*=\s*[^;\n]*\?\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*:\s*(['"])((?:\\.|(?!\3)[^\\])*)\3/g;

  function normalizeMessage(message) {
    let placeholderIndex = 0;
    return message
      .replace(/\$\{([\s\S]*?)\}/g, () => `{arg${placeholderIndex++}}`)
      .replace(/\s+/g, ' ')
      .trim();
  }

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(messagePattern)) {
      const message = normalizeMessage(match[2]);
      if (hasWords(message)) messages.add(message);
    }
    for (const match of source.matchAll(/locale\.translate\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      if (hasWords(match[2])) messages.add(match[2]);
    }
    for (const method of source.matchAll(returnedMessagePattern)) {
      for (const match of method[1].matchAll(returnLiteralPattern)) {
        const message = normalizeMessage(match[2]);
        if (hasWords(message)) messages.add(message);
      }
    }
    for (const match of source.matchAll(runtimeMessagePattern)) {
      const message = normalizeMessage(match[2]);
      if (hasWords(message)) messages.add(message);
      for (const expression of match[2].matchAll(/\$\{([\s\S]*?)\}/g)) {
        for (const literal of expression[1].matchAll(/(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) {
          const nestedMessage = normalizeMessage(literal[2]);
          if (hasWords(nestedMessage)) messages.add(nestedMessage);
        }
      }
    }
    for (const match of source.matchAll(conditionalReasonPattern)) {
      for (const message of [match[2], match[4]]) {
        if (hasWords(message)) messages.add(message);
      }
    }
  }
}

const templateRoots = [
  path.join(uiRoot, 'app'),
  ...walk(path.join(uiRoot, 'lib')).filter((target) => target.endsWith('.hbs')),
];
const templates = templateRoots.flatMap((entry) => {
  if (entry.endsWith('.hbs')) return [entry];
  return walk(entry).filter((target) => target.endsWith('.hbs'));
});
const messages = new Set();
let changedTemplates = 0;

for (const template of [...new Set(templates)]) {
  const source = fs.readFileSync(template, 'utf8');
  addExistingMessages(source, messages);
  const transformed = transformTemplate(source, messages);
  if (transformed !== source) {
    changedTemplates++;
    if (process.argv.includes('--apply')) fs.writeFileSync(template, transformed);
  }
}

addModelMessages(messages);
addFlashMessages(messages);

if (process.argv.includes('--apply')) {
  const catalog = Object.fromEntries([...messages].sort().map((message) => [message, message]));
  fs.writeFileSync(
    path.join(localeRoot, 'en-US.js'),
    `export default ${JSON.stringify(catalog, null, 2)};\n`
  );
}

process.stdout.write(
  `${changedTemplates} templates, ${messages.size} source messages${process.argv.includes('--apply') ? ' written' : ' found'}.\n`
);
