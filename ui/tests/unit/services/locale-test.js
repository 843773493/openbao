import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';

module('Unit | Service | locale', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    window.localStorage.removeItem('openbao-locale');
  });

  hooks.afterEach(function () {
    window.localStorage.removeItem('openbao-locale');
    document.documentElement.lang = 'en-US';
  });

  test('stores the selected language and updates the document language', function (assert) {
    const locale = this.owner.lookup('service:locale');

    locale.setLanguage('zh-CN');

    assert.strictEqual(window.localStorage.getItem('openbao-locale'), 'zh-CN');
    assert.strictEqual(document.documentElement.lang, 'zh-CN');
  });

  test('translates static and interpolated messages', function (assert) {
    const locale = this.owner.lookup('service:locale');
    locale.setLanguage('zh-CN');

    assert.strictEqual(locale.translate('Language'), '语言');
    assert.strictEqual(
      locale.translate('Successfully created the application Demo App.'),
      '已成功创建应用程序 Demo App。'
    );
    assert.strictEqual(
      locale.translate('Successfully created the application {arg0}.', { arg0: 'Demo App' }),
      '已成功创建应用程序 Demo App。'
    );
    assert.strictEqual(locale.translate('Successfully deleted Entity: 123'), '已成功删除 实体：123');
    assert.strictEqual(locale.translate('Successfully deleted Entity 123.'), '已成功删除 实体 123。');
    assert.strictEqual(locale.translate('Successfully saved Entity 123.'), '已成功保存 实体 123。');
    assert.strictEqual(
      locale.translate('This code has already been used. Please wait until a new code is available.'),
      '此验证码已使用过。请等待新验证码生成。'
    );
    assert.strictEqual(
      locale.translate('We ran into a problem and could not continue: See OpenBao logs for details.'),
      '遇到问题，无法继续：请查看 OpenBao 日志了解详情。'
    );
  });
});
