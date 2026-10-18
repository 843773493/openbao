import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class LocalePickerComponent extends Component {
  @service locale;

  @action
  updateLanguage(event) {
    this.locale.setLanguage(event.target.value);
  }
}
