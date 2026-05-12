# Building a Phone Number PCF Control for Dynamics 365 Contact Center

*A deep dive into how the control handles parsing, formatting, validation, and Contact Center-aware dialing — and why each decision was made.*

---

Phone numbers are deceptively simple. They look like text fields, but the moment you start accepting input from real users, you realise how many ways a valid number can be written. `+31639896134`. `06 39 89 61 34`. `0031 6 39896134`. All the same number, all written differently. And if your Contact Center integration downstream expects E.164, only one of those three will work without conversion.

That is the problem this PCF control solves. The full source is [on GitHub](https://github.com/ameijers/PCF-Phone-Number-Control). This post walks through how it works under the hood.

---

## Why PCF and Not a Script

The instinct is often to handle phone number normalization in a Power Automate flow or an on-save plugin. That works, but it pushes the feedback loop far away from the user. They type a number, save the record, wait for the platform to process it, and only then find out the number was invalid. By then, the context is gone.

A PCF control keeps the logic in the field itself. Validation happens while typing. The user sees the result immediately. And the normalized value is written to Dataverse the moment the input is valid, without any roundtrip.

---

## The Dual-Value Design

The most important design choice in this control is that it keeps two representations of the phone number at all times:

- A **display value**: what the user sees in the input field, formatted for readability.
- A **stored value**: the E.164 string that gets written back to Dataverse via `getOutputs()`.

These two are always kept in sync, but they are never the same string. `+31 6 39896134` is what you show. `+31639896134` is what you store.

```typescript
public getOutputs(): IOutputs {
  return {
    phoneNumber: this.currentValue || undefined
  };
}
```

`this.currentValue` always holds the E.164 value. It is only updated when a valid, parseable number is found. Invalid input does not touch it.

---

## Parsing: libphonenumber-js

All parsing and formatting is handled by `libphonenumber-js`. This is the right library for this job because it understands country codes, local number formats, and international notation — including the ambiguity between them.

The core parsing method is `parsePhoneNumber`:

```typescript
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
```

There are two parsing attempts. The first uses `defaultRegion` if one is configured — this allows local numbers like `06 39 89 61 34` to be interpreted as Dutch numbers when `defaultRegion = NL` is set. The second is a fallback for numbers that start with `+` but contain non-numeric characters (like spaces or dashes). It strips everything except digits and the leading `+`, then tries again.

If neither attempt produces a valid number, the method returns `undefined`. The calling code handles that as an invalid state.

---

## Region Detection

The `defaultRegion` property can be set explicitly as a PCF input parameter. But if it is not set, the control tries to derive a country code from the browser's locale:

```typescript
private detectRegionFromLocale(): CountryCode | undefined {
  const lang = navigator.language ?? "";
  const parts = lang.split("-");
  if (parts.length >= 2) {
    return this.normalizeRegion(parts[parts.length - 1]);
  }
  return undefined;
}
```

A locale tag like `nl-NL` splits into `["nl", "NL"]`. The last segment is taken as the country code and validated against `libphonenumber-js`'s `isSupportedCountry` before being used.

```typescript
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
```

If neither the explicit input nor the locale produces a valid country code, `defaultRegion` stays `undefined`. In that case, only numbers with an explicit `+` prefix will parse correctly, because the library has no country context to fall back on.

---

## Formatting While Typing

While the user is actively typing, the control uses `AsYouType` from `libphonenumber-js` to keep the value readable without interrupting input:

```typescript
private formatWhileTyping(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return "";
  }

  try {
    const formatter = this.defaultRegion
      ? new AsYouType(this.defaultRegion)
      : new AsYouType();
    const formattedValue = formatter.input(trimmedValue);
    return formattedValue || trimmedValue;
  } catch {
    return trimmedValue;
  }
}
```

`AsYouType` adds spaces and formatting characters as the user types, so `+316398` becomes `+31 6 398` progressively. If formatting fails for any reason, the original trimmed value is returned unchanged. The control never corrupts what the user typed.

---

## The Input Handler

This is where things get coordinated. Every keystroke hits `handleInput`:

```typescript
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
```

A few things are worth noting here.

`notifyOutputChanged()` is only called when `currentValue` actually changes. Calling it on every keystroke would flood Dataverse with updates and cause unnecessary dirty state on the form.

`hasUncommittedInvalidInput` is a flag that tracks whether the user has typed something that is not yet valid. This is important for `syncView`, which runs every time the PCF framework calls `updateView`. Without this flag, an intermediate invalid input would get overwritten by the last known good value every time the framework refreshes the control.

The dial button is toggled based on whether there is a valid E.164 value. No valid number, no call button.

---

## The Blur Handler

On blur, the control tries to clean up whatever the user left behind:

```typescript
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
```

If the number is valid on blur, the display value is upgraded to the full international format from `formatForDisplay`. So `+316398` typed quickly becomes `+31 6 398` while typing, and on blur, if a complete valid number was entered, it snaps to the clean international display format.

If the number is still invalid on blur, the field keeps the user's input and shows the validation message. It does not silently revert to the last known good value — that would be confusing.

---

## Validation Display

Validation state is surfaced through two mechanisms:

```typescript
private setValidity(displayValue: string, e164Value: string): void {
  const isInvalid = displayValue !== "" && e164Value === "";
  this.input.setAttribute("aria-invalid", String(isInvalid));
  this.validationMessage.hidden = !isInvalid;
  this.validationMessage.textContent = isInvalid ? VALIDATION_MESSAGE_TEXT : "";
  this.updateWrapperState();
}
```

`aria-invalid` is set on the input element, which triggers the CSS `invalid` styling via the wrapper class. The validation message `div` is hidden or shown, and its `role="alert"` with `aria-live="polite"` ensures screen readers announce it without being intrusive.

The validation message element is identified by a randomly generated ID:

```typescript
private validationMessageId = `pcf-phone-validation-message-${Math.random().toString(36).slice(2, 10)}`;
```

This is done so that multiple instances of the control on the same form do not share the same `aria-describedby` target. Each input correctly references its own message element.

---

## The Dial Button and Contact Center Integration

The call button appears to the right of the input. It is disabled until a valid number is present.

When clicked, the handler works through a priority chain:

```typescript
private readonly handleDial = (): void => {
  if (!this.currentValue) return;

  try {
    const cif = (window as any).Microsoft?.CIFramework;
    if (typeof cif?.outboundCommunication === "function") {
      cif.outboundCommunication(this.currentValue);
      return;
    }

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
```

The first check is for `Microsoft.CIFramework.outboundCommunication`. This is the Channel Integration Framework API that Dynamics 365 Contact Center exposes when a soft phone is active. If it is available, the control uses it — which means the call goes through the CCaaS dialer rather than the system phone app. This is the piece that makes the control useful in a Contact Center context specifically.

If CIF is not available, it falls back to `Xrm.Navigation.openUrl` with a `tel:` URI, which respects the Dynamics navigation context. If that is also not available, it falls back to `window.location.href`, which opens whatever the operating system registered for `tel:` links.

The whole block is wrapped in a try/catch because a dial failure should never interfere with the user's ability to continue working in the form.

---

## The Icon

The dial button uses an inline SVG rather than a font icon or an image:

```typescript
function createCallIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  // ...
}
```

This is intentional. Font icons depend on the icon font being loaded and available in the PCF host, which is not guaranteed across all Dynamics form configurations and embedding contexts. An inline SVG renders correctly everywhere, with no dependencies. The path data is taken from the Fluent UI system icons repository (MIT licensed) — specifically the "Call 20 Regular" icon that Dynamics itself uses for phone field call buttons, so it visually matches the platform.

---

## Protecting Against updateView Thrash

The PCF framework calls `updateView` whenever the bound value or context changes. This creates a problem: if the user is mid-input and the framework triggers a view refresh, the control could overwrite what the user is typing with the last known good value from Dataverse.

The `syncView` method handles this carefully:

```typescript
// Skip update only while the user is actively typing; always refresh after save
if (document.activeElement === this.input) {
  return;
}

// Keep invalid typed text visible instead of silently snapping back to last valid value.
if (this.hasUncommittedInvalidInput && boundValue === this.currentValue) {
  this.updateWrapperState();
  return;
}
```

If the input has focus, `syncView` exits early. The user is typing; do not interrupt them.

If the user has typed something invalid and the bound Dataverse value has not changed, the invalid text is kept in place. This prevents the control from silently reverting to `+31639896134` while the user is staring at `+316398xx` trying to correct a typo.

---

## Deploying

Clone the repository from [GitHub](https://github.com/ameijers/PCF-Phone-Number-Control) and build it yourself. The control is packaged as a managed Dataverse solution:

```bash
npm run build
cd pcfsolution
msbuild /t:build /restore
```

Import the generated managed solution into your Dataverse environment, bind the control to any phone number column in a model-driven form, and optionally configure the `defaultRegion` input (for example, `NL` for the Netherlands).

After deploying, verify by:

1. Entering a local number without a country code — it should resolve to the international format on blur.
2. Entering an obviously invalid string — the validation message should appear.
3. Entering a valid number and clicking the call button — in a Contact Center session, it should trigger the CIF dialer.
4. Checking the saved record value in Dataverse — it should be E.164, not the display format.

---

## Final Thoughts

Phone number fields are one of those places where a small amount of extra investment in the input experience pays dividends in data quality for a long time. Users do not need to know what E.164 is. They type a number in whatever format feels natural to them, and the control handles the rest.

The [GitHub repository](https://github.com/ameijers/PCF-Phone-Number-Control) has the full source, including the manifest and the PCF solution project. If you are building for a Contact Center environment and want consistent phone data in Dataverse without asking your users to change how they type, this is a practical starting point.
