import { DEFAULT_SYNTHETIC } from '../normalisation/synthetic.js';

export function initDialogCapture(emit) {
  // Native browser dialogs (alert, confirm, prompt, beforeunload)
  // These need to be intercepted via monkey-patching since there are no DOM events

  const origAlert = window.alert;
  const origConfirm = window.confirm;
  const origPrompt = window.prompt;

  window.alert = function (message) {
    emit('dialog', null, {
      dialog_type: 'alert',
      message: String(message),
      response: 'OK',
    });
    return origAlert.call(this, message);
  };

  window.confirm = function (message) {
    const result = origConfirm.call(this, message);
    emit('dialog', null, {
      dialog_type: 'confirm',
      message: String(message),
      response: result ? 'OK' : 'Cancel',
    });
    return result;
  };

  window.prompt = function (message, defaultValue) {
    const result = origPrompt.call(this, message, defaultValue);
    emit('dialog', null, {
      dialog_type: 'prompt',
      message: String(message),
      response: result !== null ? 'OK' : 'Cancel',
      input_value: result !== null ? DEFAULT_SYNTHETIC : null,
    });
    return result;
  };

  window.addEventListener('beforeunload', (e) => {
    emit('dialog', null, {
      dialog_type: 'beforeunload',
      message: e.returnValue || '',
    });
  });
}
