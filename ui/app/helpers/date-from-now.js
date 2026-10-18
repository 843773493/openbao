/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

import { helper } from '@ember/component/helper';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function dateFromNow([date], options = {}) {
  // check first if string. If it is, it could be ISO format or UTC, either way create a new date object
  // otherwise it's a number or object and just return
  const newDate = typeof date === 'string' ? new Date(date) : date;
  const locale = document.documentElement.lang === 'zh-CN' ? zhCN : options.locale;
  return formatDistanceToNow(newDate, { ...options, locale });
}

export default helper(dateFromNow);
