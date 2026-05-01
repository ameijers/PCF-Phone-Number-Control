import { AsYouType, CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";

type MaybeString = string | null | undefined;

export class PhoneNumberControl implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private container: HTMLDivElement;
  private input: HTMLInputElement;
  private notifyOutputChanged: () => void;
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

    this.input = document.createElement("input");
    this.input.className = "phone-number-control__input";
    this.input.type = "tel";
    this.input.inputMode = "tel";
    this.input.placeholder = "+31 6 39896134";
    this.input.autocomplete = "tel";
    this.input.addEventListener("input", this.handleInput);
    this.input.addEventListener("blur", this.handleBlur);

    this.container.appendChild(this.input);

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
  }

  private readonly handleInput = (): void => {
    const nextDisplayValue = this.formatWhileTyping(this.input.value);
    this.input.value = nextDisplayValue;

    const nextE164Value = this.toE164(nextDisplayValue);
    this.setValidity(nextDisplayValue, nextE164Value);

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
      this.notifyOutputChanged();
      return;
    }

    this.input.value = this.formatWhileTyping(trimmedValue);
    this.setValidity(this.input.value, "");
  };

  private syncView(context: ComponentFramework.Context<IInputs>): void {
    this.defaultRegion = this.normalizeRegion(context.parameters.defaultRegion.raw);
    this.input.disabled = context.mode.isControlDisabled;

    const boundValue = context.parameters.phoneNumber.raw ?? "";
    const nextE164Value = this.toE164(boundValue) || this.currentValue;

    if (document.activeElement === this.input && nextE164Value === this.currentValue) {
      return;
    }

    this.currentValue = nextE164Value;

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
