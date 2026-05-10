import { AsYouType, CountryCode, isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js";
import { IInputs, IOutputs } from "./generated/ManifestTypes";

type MaybeString = string | null | undefined;

const VALIDATION_MESSAGE_TEXT = "Enter a valid phone number, for example +31 6 39896134.";

export class PhoneNumberControl implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private container!: HTMLDivElement;
  private wrapper!: HTMLDivElement;
  private input!: HTMLInputElement;
  private dialButton!: HTMLButtonElement;
  private validationMessage!: HTMLDivElement;
  private notifyOutputChanged!: () => void;
  private currentValue = "";
  private defaultRegion?: CountryCode;
  private hasUncommittedInvalidInput = false;
  private validationMessageId = `pcf-phone-validation-message-${Math.random().toString(36).slice(2, 10)}`;

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement
  ): void {
    this.container = container;
    this.notifyOutputChanged = notifyOutputChanged;

    this.container.classList.add("phone-number-control");

    // Wrapper holds input + dial button side by side
    this.wrapper = document.createElement("div");
    this.wrapper.className = "phone-number-control__wrapper";

    this.input = document.createElement("input");
    this.input.className = "phone-number-control__input";
    this.input.type = "tel";
    this.input.inputMode = "tel";
    this.input.placeholder = "+31 6 39896134";
    this.input.autocomplete = "tel";
    this.input.setAttribute("aria-describedby", this.validationMessageId);
    this.input.addEventListener("input", this.handleInput);
    this.input.addEventListener("blur", this.handleBlur);

    // Dial button — uses the standard MDL2 phone glyph Dynamics fields use.
    this.dialButton = document.createElement("button");
    this.dialButton.className = "phone-number-control__dial-button";
    this.dialButton.type = "button";
    this.dialButton.title = "Call";
    this.dialButton.setAttribute("aria-label", "Call");
    this.dialButton.textContent = "\uE717";
    this.dialButton.disabled = true;
    this.dialButton.addEventListener("click", this.handleDial);

    this.validationMessage = document.createElement("div");
    this.validationMessage.id = this.validationMessageId;
    this.validationMessage.className = "phone-number-control__message";
    this.validationMessage.setAttribute("role", "alert");
    this.validationMessage.setAttribute("aria-live", "polite");
    this.validationMessage.hidden = true;

    this.wrapper.appendChild(this.input);
    this.wrapper.appendChild(this.dialButton);
    this.container.appendChild(this.wrapper);
    this.container.appendChild(this.validationMessage);

    this.syncView(context);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this.syncView(context);
  }

  public getOutputs(): IOutputs {
    return {
      phoneNumber: this.currentValue || undefined
    };
  }

  public destroy(): void {
    this.input.removeEventListener("input", this.handleInput);
    this.input.removeEventListener("blur", this.handleBlur);
    this.dialButton.removeEventListener("click", this.handleDial);
  }

  private readonly handleDial = (): void => {
    if (!this.currentValue) return;

    try {
      // Use Dynamics Channel Integration Framework (CCaaS soft phone) when available
      const cif = (window as any).Microsoft?.CIFramework;
      if (typeof cif?.outboundCommunication === "function") {
        cif.outboundCommunication(this.currentValue);
        return;
      }

      // Try Dynamics openUrl first, then browser-level tel fallback.
      const xrm = (window as any).Xrm;
      if (typeof xrm?.Navigation?.openUrl === "function") {
        xrm.Navigation.openUrl(`tel:${this.currentValue}`);
        return;
      }

      window.location.href = `tel:${this.currentValue}`;
    } catch {
      // Never let dial errors break interaction with the form.
    }
  };

  private readonly handleInput = (): void => {
    const nextDisplayValue = this.formatWhileTyping(this.input.value);
    this.input.value = nextDisplayValue;

    const nextE164Value = this.toE164(nextDisplayValue);
    this.setValidity(nextDisplayValue, nextE164Value);
    this.hasUncommittedInvalidInput = nextDisplayValue !== "" && nextE164Value === "";
    this.dialButton.disabled = !nextE164Value;

    if (nextDisplayValue === "") {
      if (this.currentValue !== "") {
        this.currentValue = "";
        this.notifyOutputChanged();
      }
      this.hasUncommittedInvalidInput = false;
      return;
    }

    if (nextE164Value && nextE164Value !== this.currentValue) {
      this.currentValue = nextE164Value;
      this.notifyOutputChanged();
      this.hasUncommittedInvalidInput = false;
    }
  };

  private readonly handleBlur = (): void => {
    const trimmedValue = this.input.value.trim();

    if (trimmedValue === "") {
      this.input.value = "";
      this.setValidity("", "");
      this.dialButton.disabled = true;

      if (this.currentValue !== "") {
        this.currentValue = "";
        this.notifyOutputChanged();
      }

      this.hasUncommittedInvalidInput = false;

      return;
    }

    const nextE164Value = this.toE164(trimmedValue);

    if (nextE164Value) {
      this.currentValue = nextE164Value;
      this.input.value = this.formatForDisplay(nextE164Value);
      this.setValidity(this.input.value, nextE164Value);
      this.dialButton.disabled = false;
      this.hasUncommittedInvalidInput = false;
      this.notifyOutputChanged();
      return;
    }

    this.input.value = this.formatWhileTyping(trimmedValue);
    this.setValidity(this.input.value, "");
    this.hasUncommittedInvalidInput = true;
    this.dialButton.disabled = true;
  };

  private updateWrapperState(): void {
    this.wrapper.classList.toggle("phone-number-control__wrapper--disabled", this.input.disabled);
    this.wrapper.classList.toggle(
      "phone-number-control__wrapper--invalid",
      this.input.getAttribute("aria-invalid") === "true"
    );
  }

  private syncView(context: ComponentFramework.Context<IInputs>): void {
    try {
      const defaultRegionRaw = context.parameters?.defaultRegion?.raw;
      const phoneNumberRaw = context.parameters?.phoneNumber?.raw;

      // Priority: explicit defaultRegion input → browser locale → undefined
      this.defaultRegion = this.normalizeRegion(defaultRegionRaw) ?? this.detectRegionFromLocale();

      const isDisabled = context.mode?.isControlDisabled ?? false;
      this.input.disabled = isDisabled;
      // Hide dial button when the field is read-only/disabled
      this.dialButton.style.display = isDisabled ? "none" : "flex";

      const boundValue = phoneNumberRaw ?? "";
      const nextE164Value = this.toE164(boundValue);

      // Skip update only while the user is actively typing; always refresh after save
      if (document.activeElement === this.input) {
        return;
      }

      // Keep invalid typed text visible instead of silently snapping back to last valid value.
      if (this.hasUncommittedInvalidInput && boundValue === this.currentValue) {
        this.updateWrapperState();
        return;
      }

      this.currentValue = nextE164Value;
      this.dialButton.disabled = !nextE164Value;

      if (boundValue === "") {
        this.input.value = "";
        this.setValidity("", "");
        return;
      }

      this.input.value = nextE164Value
        ? this.formatForDisplay(nextE164Value)
        : this.formatWhileTyping(boundValue);

      this.setValidity(this.input.value, nextE164Value);
      this.hasUncommittedInvalidInput = this.input.value !== "" && nextE164Value === "";
      this.updateWrapperState();
    } catch {
      // Keep the control load-safe in form designer even if runtime context is incomplete.
      this.defaultRegion = this.detectRegionFromLocale();
      this.input.value = "";
      this.input.disabled = false;
      this.dialButton.disabled = true;
      this.dialButton.style.display = "flex";
      this.setValidity("", "");
      this.hasUncommittedInvalidInput = false;
      this.updateWrapperState();
    }
  }

  // Derive a country code from the browser's language tag, e.g. "nl-NL" → "NL"
  private detectRegionFromLocale(): CountryCode | undefined {
    const lang = navigator.language ?? "";
    const parts = lang.split("-");
    if (parts.length >= 2) {
      return this.normalizeRegion(parts[parts.length - 1]);
    }
    return undefined;
  }

  private toE164(value: string): string {
    try {
      const parsedNumber = this.parsePhoneNumber(value);
      return parsedNumber?.number ?? "";
    } catch {
      return "";
    }
  }

  private formatForDisplay(value: string): string {
    try {
      const parsedNumber = this.parsePhoneNumber(value);
      return parsedNumber?.formatInternational() ?? this.formatWhileTyping(value);
    } catch {
      return this.formatWhileTyping(value);
    }
  }

  private formatWhileTyping(value: string): string {
    const trimmedValue = value.trim();

    if (trimmedValue === "") {
      return "";
    }

    try {
      const formatter = this.defaultRegion ? new AsYouType(this.defaultRegion) : new AsYouType();
      const formattedValue = formatter.input(trimmedValue);
      return formattedValue || trimmedValue;
    } catch {
      return trimmedValue;
    }
  }

  private parsePhoneNumber(value: string) {
    const trimmedValue = value.trim();

    if (trimmedValue === "") {
      return undefined;
    }

    const parsedNumber = this.defaultRegion
      ? parsePhoneNumberFromString(trimmedValue, this.defaultRegion)
      : parsePhoneNumberFromString(trimmedValue);

    if (parsedNumber?.isValid()) {
      return parsedNumber;
    }

    if (!trimmedValue.startsWith("+")) {
      return undefined;
    }

    const sanitizedValue = `+${trimmedValue.replace(/\D/g, "")}`;
    const fallbackNumber = parsePhoneNumberFromString(sanitizedValue);
    return fallbackNumber?.isValid() ? fallbackNumber : undefined;
  }

  private normalizeRegion(value: MaybeString): CountryCode | undefined {
    const trimmedValue = value?.trim().toUpperCase();

    if (!trimmedValue || trimmedValue.length !== 2) {
      return undefined;
    }

    if (!isSupportedCountry(trimmedValue as CountryCode)) {
      return undefined;
    }

    return trimmedValue as CountryCode;
  }

  private setValidity(displayValue: string, e164Value: string): void {
    const isInvalid = displayValue !== "" && e164Value === "";
    this.input.setAttribute("aria-invalid", String(isInvalid));
    this.validationMessage.hidden = !isInvalid;
    this.validationMessage.textContent = isInvalid ? VALIDATION_MESSAGE_TEXT : "";
    this.updateWrapperState();
  }
}
