import { AsYouType, CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";
import { IInputs, IOutputs } from "./generated/ManifestTypes";

type MaybeString = string | null | undefined;

// Fluent UI phone handset icon path, matches the Dynamics standard phone field icon
const PHONE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" width="16" height="16" focusable="false" aria-hidden="true"><path d="M1971 1538q26 102-17 197t-131 147l-170 114q-70 47-153 71t-167 24q-117 0-229-40t-211-108q-182-122-338-278T478 1338Q356 1156 234 974T126 745q-40-118-40-230 0-84 24-167t71-153L295 225q52-88 147-131t197-17l74 18q46 11 88 35t74 60l338 432q32 41 43 90t-1 99l-88 264q-8 24-6 48t14 44l336 335q20 12 44 14t48-6l264-88q48-12 97-1t91 43l432 338q37 32 60 74t35 88z"/></svg>`;

export class PhoneNumberControl implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private container!: HTMLDivElement;
  private wrapper!: HTMLDivElement;
  private input!: HTMLInputElement;
  private dialButton!: HTMLButtonElement;
  private notifyOutputChanged!: () => void;
  private currentValue = "";
  private defaultRegion?: CountryCode;

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
    this.input.addEventListener("input", this.handleInput);
    this.input.addEventListener("blur", this.handleBlur);

    // Dial button — matches the standard Dynamics phone icon behaviour
    this.dialButton = document.createElement("button");
    this.dialButton.className = "phone-number-control__dial-button";
    this.dialButton.type = "button";
    this.dialButton.title = "Call";
    this.dialButton.setAttribute("aria-label", "Call");
    this.dialButton.innerHTML = PHONE_ICON_SVG;
    this.dialButton.disabled = true;
    this.dialButton.addEventListener("click", this.handleDial);

    this.wrapper.appendChild(this.input);
    this.wrapper.appendChild(this.dialButton);
    this.container.appendChild(this.wrapper);

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

    // Use Dynamics Channel Integration Framework (CCaaS soft phone) when available
    const cif = (window as any).Microsoft?.CIFramework;
    if (typeof cif?.outboundCommunication === "function") {
      cif.outboundCommunication(this.currentValue);
      return;
    }

    // Fall back to tel: URI — OS or default calling app handles it
    window.open(`tel:${this.currentValue}`);
  };

  private readonly handleInput = (): void => {
    const nextDisplayValue = this.formatWhileTyping(this.input.value);
    this.input.value = nextDisplayValue;

    const nextE164Value = this.toE164(nextDisplayValue);
    this.setValidity(nextDisplayValue, nextE164Value);
    this.dialButton.disabled = !nextE164Value;

    if (nextDisplayValue === "") {
      if (this.currentValue !== "") {
        this.currentValue = "";
        this.notifyOutputChanged();
      }
      return;
    }

    if (nextE164Value && nextE164Value !== this.currentValue) {
      this.currentValue = nextE164Value;
      this.notifyOutputChanged();
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

      return;
    }

    const nextE164Value = this.toE164(trimmedValue);

    if (nextE164Value) {
      this.currentValue = nextE164Value;
      this.input.value = this.formatForDisplay(nextE164Value);
      this.setValidity(this.input.value, nextE164Value);
      this.dialButton.disabled = false;
      this.notifyOutputChanged();
      return;
    }

    this.input.value = this.formatWhileTyping(trimmedValue);
    this.setValidity(this.input.value, "");
    this.dialButton.disabled = true;
  };

  private syncView(context: ComponentFramework.Context<IInputs>): void {
    // Priority: explicit defaultRegion input → browser locale → undefined
    this.defaultRegion =
      this.normalizeRegion(context.parameters.defaultRegion.raw) ??
      this.detectRegionFromLocale();

    const isDisabled = context.mode.isControlDisabled;
    this.input.disabled = isDisabled;
    // Hide dial button when the field is read-only/disabled
    this.dialButton.style.display = isDisabled ? "none" : "flex";

    const boundValue = context.parameters.phoneNumber.raw ?? "";
    const nextE164Value = this.toE164(boundValue) || this.currentValue;

    // Skip update only while the user is actively typing; always refresh after save
    if (document.activeElement === this.input) {
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
    const parsedNumber = this.parsePhoneNumber(value);
    return parsedNumber?.number ?? "";
  }

  private formatForDisplay(value: string): string {
    const parsedNumber = this.parsePhoneNumber(value);
    return parsedNumber?.formatInternational() ?? this.formatWhileTyping(value);
  }

  private formatWhileTyping(value: string): string {
    const trimmedValue = value.trim();

    if (trimmedValue === "") {
      return "";
    }

    const formatter = this.defaultRegion ? new AsYouType(this.defaultRegion) : new AsYouType();
    const formattedValue = formatter.input(trimmedValue);
    return formattedValue || trimmedValue;
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

    return trimmedValue as CountryCode;
  }

  private setValidity(displayValue: string, e164Value: string): void {
    const isInvalid = displayValue !== "" && e164Value === "";
    this.input.setAttribute("aria-invalid", String(isInvalid));
  }
}
