/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

import { helper } from '@ember/component/helper';
import { format, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';

function localeOptions() {
  return document.documentElement.lang === 'zh-CN' ? { locale: zhCN } : {};
}

export function dateFormat([date, style], { isFormatted = false, withTimeZone = false }) {
  // see format breaking in upgrade to date-fns 2.x https://github.com/date-fns/date-fns/blob/master/CHANGELOG.md#changed-5
  if (isFormatted) {
    return format(new Date(date), style, localeOptions());
  }
  let number = typeof date === 'string' ? parseISO(date) : date;
  if (!number) {
    return;
  }
  if (number.toString().length === 10) {
    number = new Date(number * 1000);
  }
  let zone; // local timezone ex: 'PST'
  try {
    // passing undefined means default to the browser's locale
    zone =
      ' ' +
      new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
        timeZoneName: 'short',
      })
        .formatToParts(number)
        .find((part) => part.type === 'timeZoneName').value;
  } catch {
    zone = '';
  }
  zone = withTimeZone ? zone : '';
  return format(number, style, localeOptions()) + zone;
}

export default helper(dateFormat);
