/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

import { helper } from '@ember/component/helper';

export function formatNumber([value]) {
  if (typeof value !== 'number') {
    return value;
  }
  return new Intl.NumberFormat(document.documentElement.lang || undefined).format(value);
}

export default helper(formatNumber);
