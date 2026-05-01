# Building a Phone Number PCF Control for Dynamics 365

Phone number fields look simple until people start using them.

One user types `0639896134`, another types `+31(0)6 39 89 61 34`, and someone else pastes `0031 6 39896134`. All of them mean the same thing, but without consistent handling the data in Dataverse quickly becomes messy. That inconsistency affects more than appearance. It can break integrations, make outbound calling workflows harder, and complicate downstream validation.

That was the reason for building this Power Apps Component Framework control for Dynamics 365: let users enter phone numbers in a natural way, show the value back in a readable format, and store the actual column value in E.164.

## The Goal

The control solves two problems at the same time.

First, it improves the editing experience. Users should be able to enter a phone number without having to think about strict formatting rules. Spaces, punctuation, and local notation should not get in the way.

Second, it improves data quality. Regardless of how the number is entered, the value saved to the Dataverse phone number column should be normalized to E.164, such as `+31639896134`.

That combination gives you a cleaner user experience and more reliable data for integrations, calling platforms, SMS providers, and reporting.

## What the Control Does

The control is designed for phone number columns in Dynamics 365 and behaves as follows:

- Users can type or paste a phone number in a loose format.
- While typing, the control applies international-style spacing to keep the value readable.
- When the user leaves the field, the number is normalized again and shown in a clean formatted version.
- The value returned to Dataverse is stored in E.164.
- If a user enters a local number without a `+` prefix, the control can interpret it using an optional `defaultRegion` input such as `NL`.

In practice that means a user can type a Dutch mobile number in a familiar local way, while the database still receives a canonical international value.

## Why E.164 Matters

E.164 is the standard international phone number format. It starts with a `+`, followed by country code and national number, with no spaces or decorative characters.

For example:

- Displayed value: `+31 6 39896134`
- Stored value: `+31639896134`

This format is useful because it removes ambiguity. Systems no longer need to guess which country a number belongs to, and integration points get a consistent string to work with.

If your Dynamics 365 environment connects to telephony providers, marketing platforms, customer service tools, or workflow automation, that consistency is worth a lot.

## Why a PCF Control Is the Right Fit

There are several ways to influence how users enter data in model-driven apps, but a PCF control is the right place when you want to own the full input experience.

With PCF, the behavior lives directly in the field control:

- Formatting happens close to the user interaction.
- The Dataverse column still remains the source of truth.
- The control can be reused across forms and tables.
- You can add configuration, such as a default country or region.

This approach avoids pushing phone-number cleanup into plugins, Power Automate flows, or client-side form scripts after the value is already entered incorrectly.

## Implementation Approach

The control is implemented in TypeScript as a standard field-bound PCF control.

The manifest defines two properties:

- `phoneNumber`: the bound Dataverse phone field.
- `defaultRegion`: an optional input property used to interpret local numbers.

The control itself uses a single telephone input and keeps two representations of the value in play:

- A formatted display value for the user.
- A normalized E.164 value for Dataverse.

That distinction is the key design choice. The user should see a number that is easy to read, but the database should receive a value optimized for consistency and interoperability.

## Parsing and Formatting

The control uses `libphonenumber-js`, which is a practical choice because it already handles country-aware parsing, validation, and international formatting.

The flow is straightforward:

1. Capture the raw input from the user.
2. Apply as-you-type formatting for readability.
3. Try to parse the number with the configured region when needed.
4. If the number is valid, return the E.164 representation through `getOutputs()`.
5. On blur, update the visible value to a polished international display format.

This makes the control forgiving during editing, while still keeping the stored value strict.

## Example Scenario

Imagine a user in the Netherlands enters:

`06 39 89 61 34`

If the control has `defaultRegion = NL`, it can understand that the number is Dutch even though the user did not type `+31`.

The result can then be:

- Displayed to the user as: `+31 6 39896134`
- Stored in Dataverse as: `+31639896134`

That is exactly the kind of conversion this control is intended to handle.

## Benefits in Real Projects

The biggest advantage is that users do not need to be trained on phone-number standards. They can type naturally, and the control handles normalization for them.

Beyond that, the control helps with:

- Better data quality in Dataverse.
- More reliable outbound integrations.
- Consistent formatting across forms.
- Less cleanup logic elsewhere in the solution.
- A better user experience on phone number fields.

It is a small component, but it improves both usability and data integrity in a place where organizations often accumulate avoidable inconsistency.

## Project Structure

The solution is intentionally small and focused:

- `ControlManifest.Input.xml` defines the PCF control contract.
- `index.ts` contains the control logic.
- `css/PhoneNumberControl.css` provides field styling.
- `strings/PhoneNumberControl.1033.resx` contains display labels and descriptions.
- `README.md` documents the local setup and behavior.

This keeps the control easy to maintain and easy to extend.

## Possible Next Steps

There are several directions to expand this control further:

- Add inline validation messaging for invalid numbers.
- Support region selection next to the input field.
- Add formatting presets for specific business scenarios.
- Extend it with click-to-call behavior.
- Add tests around parsing and output behavior.

The current version focuses on the most important foundation: flexible input, clean display, and consistent storage.

## Final Thoughts

Phone numbers are one of those data types that seem trivial until inconsistent entry starts creating operational friction. A dedicated PCF control is a practical way to solve that at the UI layer without compromising the underlying data model.

By combining a forgiving input experience with strict E.164 storage, this control makes Dynamics 365 phone fields easier to use and far more dependable.

If you are building model-driven apps and care about clean customer data, this is the kind of small UX improvement that pays off quickly.