export class AssigneeSelector {
  private container: HTMLElement;
  private checkboxes: Map<string, HTMLInputElement> = new Map();
  private emailInput: HTMLInputElement;
  private getUsers: () => Array<{ id: string; name: string; email: string }>;

  constructor(
    container: HTMLElement,
    label: string,
    getUsers: () => Array<{ id: string; name: string; email: string }>,
    prefillName?: string,
  ) {
    this.getUsers = getUsers;
    this.container = container;
    const labelEl = container.createEl('label', { text: label });
    labelEl.addClass('tn-task-mt-8');

    const users = getUsers();
    const wrapper = container.createDiv();
    wrapper.style.cssText = 'max-height:180px;overflow-y:auto;border:1px solid var(--background-modifier-border);border-radius:4px;padding:4px 8px;margin-bottom:4px';

    for (const u of users) {
      const row = wrapper.createDiv();
      row.addClass('tn-task-assignee-row');
      const cb = row.createEl('input', { attr: { type: 'checkbox' } });
      cb.style.width = '16px';
      cb.style.height = '16px';
      cb.style.margin = '0 4px 0 0';
      cb.style.flexShrink = '0';
      cb.style.cursor = 'pointer';
      cb.value = u.id;
      if (prefillName && (u.name === prefillName || u.email === prefillName)) cb.checked = true;
      this.checkboxes.set(u.id, cb);
      const span = row.createEl('span');
      span.setText(`${u.name}${u.email && u.email !== u.name ? ` (${u.email})` : ''}`);
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName !== 'INPUT') {
          cb.checked = !cb.checked;
        }
      });
    }

    const emailRow = container.createDiv();
    emailRow.addClass('tn-task-flex-row');
    const emailLabel = emailRow.createEl('span');
    emailLabel.setText('Или email:');
    this.emailInput = emailRow.createEl('input', { attr: { type: 'text', placeholder: 'user@example.com' } });
    if (prefillName && !Array.from(this.checkboxes.values()).some(cb => cb.checked)) {
      this.emailInput.value = prefillName;
    }
  }

  setSelectedIds(ids: string[]): void {
    for (const [id, cb] of this.checkboxes) {
      cb.checked = ids.includes(id);
    }
  }

  getSelectedIds(): string[] {
    const ids: string[] = [];
    for (const [id, cb] of this.checkboxes) {
      if (cb.checked) ids.push(id);
    }
    const email = this.emailInput.value.trim();
    if (email) {
      const users = this.getUsers();
      const emailToId = new Map(users.map(u => [u.email || u.name || u.id, u.id]));
      const uid = emailToId.get(email);
      if (uid && !ids.includes(uid)) ids.push(uid);
    }
    return ids;
  }
}
