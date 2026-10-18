import Helper from '@ember/component/helper';
import { inject as service } from '@ember/service';

export default class THelper extends Helper {
  @service locale;

  compute([message], values) {
    return this.locale.translate(message, values);
  }
}
