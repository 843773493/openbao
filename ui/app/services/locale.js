import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import sourceMessages from '../locales/en-US';
import translations from '../locales/zh-CN';

const LANGUAGE_STORAGE_KEY = 'openbao-locale';
const interpolationPattern = /\{([\w]+)\}/g;
const actionWords = {
  add: '添加',
  added: '添加',
  adding: '添加',
  create: '创建',
  created: '创建',
  creating: '创建',
  delete: '删除',
  deleted: '删除',
  deleting: '删除',
  disable: '停用',
  disabled: '停用',
  disabling: '停用',
  enable: '启用',
  enabled: '启用',
  enabling: '启用',
  remove: '移除',
  removed: '移除',
  removing: '移除',
  reset: '重置',
  resetting: '重置',
  revoke: '撤销',
  revoked: '撤销',
  revoking: '撤销',
  rotate: '轮换',
  rotated: '轮换',
  rotating: '轮换',
  save: '保存',
  saved: '保存',
  saving: '保存',
  update: '更新',
  updated: '更新',
  updating: '更新',
};
const identityTypeArguments = {
  'Successfully deleted {arg0}: {arg1}': 'arg0',
  'Successfully deleted {arg0} {arg1}.': 'arg0',
  'Successfully saved {arg0} {arg1}.': 'arg0',
  'Successfully {arg0} {arg1}: {arg2}': 'arg1',
  'Successfully {arg0} {arg1} {arg2}.': 'arg1',
  'Successfully {arg0} {arg1}.': 'arg1',
  'There was a problem deleting {arg0}: {arg1} - {arg2}': 'arg0',
  'There was a problem {arg0} {arg1}: {arg2} - {arg3}': 'arg1',
};
const identityTypes = {
  alias: '别名',
  entity: '实体',
  'entity alias': '实体别名',
  'group alias': '组别名',
  group: '组',
};
const nestedMessageArguments = {
  'We ran into a problem and could not continue: {arg0}': ['arg0'],
  '{arg0}. Please wait until a new code is available.': ['arg0'],
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeMessageText(value) {
  return value
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? '\\s+' : escapeRegExp(part)))
    .join('');
}

function buildMessagePatterns(messages) {
  return Object.keys(messages)
    .map((source) => {
      const placeholders = [...source.matchAll(interpolationPattern)];
      if (!placeholders.length) return null;
      let lastIndex = 0;
      let expression = '';
      for (const placeholder of placeholders) {
        expression += escapeMessageText(source.slice(lastIndex, placeholder.index));
        expression += '([\\s\\S]*?)';
        lastIndex = placeholder.index + placeholder[0].length;
      }
      expression += escapeMessageText(source.slice(lastIndex));
      return {
        source,
        keys: placeholders.map((placeholder) => placeholder[1]),
        expression: new RegExp(`^${expression}$`),
        literalLength:
          source.length - placeholders.reduce((sum, placeholder) => sum + placeholder[0].length, 0),
      };
    })
    .filter(Boolean)
    .sort((first, second) => second.literalLength - first.literalLength);
}

const messagePatterns = buildMessagePatterns(sourceMessages);

function matchMessage(message) {
  for (const pattern of messagePatterns) {
    const matches = message.match(pattern.expression);
    if (!matches) continue;
    const values = {};
    pattern.keys.forEach((key, index) => {
      const value = matches[index + 1];
      const identityType = identityTypeArguments[pattern.source] === key;
      const nestedMessage = nestedMessageArguments[pattern.source]?.includes(key);
      values[key] =
        (identityType && identityTypes[value.toLowerCase()]) ||
        (nestedMessage && translations[value]) ||
        actionWords[value] ||
        value;
    });
    return { source: pattern.source, values };
  }
}

function preferredLanguage() {
  return window.navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

export default class LocaleService extends Service {
  @tracked language;

  constructor() {
    super(...arguments);
    const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    this.language =
      savedLanguage === 'zh-CN' || savedLanguage === 'en-US' ? savedLanguage : preferredLanguage();
    document.documentElement.lang = this.language;
  }

  setLanguage(language) {
    this.language = language;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }

  translate(message, values = {}) {
    if (typeof message !== 'string') return message ?? '';
    const exactTranslation = translations[message];
    const matchedMessage =
      this.language === 'zh-CN' && exactTranslation === undefined && sourceMessages[message] === undefined
        ? matchMessage(message)
        : undefined;
    const source = sourceMessages[message] ?? message;
    const text =
      this.language === 'zh-CN'
        ? (exactTranslation ?? (matchedMessage && translations[matchedMessage.source]) ?? source)
        : source;
    const interpolationValues = { ...matchedMessage?.values, ...values };
    return text.replace(/\{([\w]+)\}/g, (placeholder, key) => {
      const value = interpolationValues[key];
      return value === undefined ? placeholder : String(value);
    });
  }
}
