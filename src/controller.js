/**
 * Open/close state for the overlay, kept outside React so the `/store` command
 * on the host side can drive it without a component being mounted yet.
 */
export class StoreDialogController {
  constructor() {
    this.isOpen = false;
    this.query = "";
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.listeners) fn(this.isOpen, this.query);
  }

  open(query = "") {
    this.isOpen = true;
    this.query = query;
    this.#emit();
  }

  close() {
    this.isOpen = false;
    this.#emit();
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }
}
