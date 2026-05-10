# Building a Phone Number PCF Control for Dynamics 365 Contact Center

_A practical look at flexible phone number input, clearer validation, and Contact Center-aware calling in a single PCF field control._

When you are working with phone number fields in Dynamics 365, the details matter very quickly.

One person types a local number. Another pastes an international number with spaces and punctuation. A third expects the call button to behave like the rest of Dynamics 365 Contact Center. Before long, a simple field becomes a source of friction.

That was the reason for building this Power Apps Component Framework control. It lets users enter phone numbers in a natural way, shows the value back in a readable format, surfaces validation clearly, stores the final value in E.164, and uses the Contact Center dialer when it is available.

## Goal

The control is trying to solve two things at once.

First, it improves the editing experience. People should be able to type a phone number without worrying about strict formatting rules. Spaces, punctuation, and local notation should not get in the way.

Second, it improves the stored data. Regardless of how the number is entered, the value written back to Dataverse should be normalized to E.164, such as `+31639896134`.

That combination gives you cleaner input, better validation, and more reliable downstream use in calling and integration scenarios.

## What It Does

The control is designed for phone number columns in Dynamics 365 and behaves as follows:

- Users can type or paste a phone number in a loose format.
- While typing, the control keeps the value readable.
- If the number is invalid, the field keeps the user’s text and shows a clear validation message.
- When the number is valid, the value is normalized and displayed in an international format.
- The value returned to Dataverse is stored in E.164.
- If a user enters a local number without a `+` prefix, the control can interpret it using an optional `defaultRegion` input such as `NL`.

That means a Dutch mobile number can still be entered in a natural local format, while Dataverse receives a canonical international value.

## Why E.164 Matters

E.164 is the standard international phone number format. It starts with a `+`, followed by country code and national number, with no spaces or decorative characters.

For example:

- Displayed value: `+31 6 39896134`
- Stored value: `+31639896134`

This matters because it removes ambiguity. Systems no longer need to guess which country a number belongs to, and integrations get a consistent string to work with.

If your Dynamics 365 environment connects to telephony providers, customer service tools, or workflow automation, that consistency is worth a lot.

## Why PCF

There are several ways to influence how users enter data in model-driven apps, but a PCF control is the right place when you want to own the full input experience.

With PCF, the behavior lives directly in the field control:

- Formatting happens close to the user interaction.
- The Dataverse column still remains the source of truth.
- The control can be reused across forms and tables.
- You can add configuration such as a default country or region.

This avoids pushing phone-number cleanup into plugins, Power Automate flows, or client-side form scripts after the value is already entered incorrectly.

## Implementation

The control is implemented in TypeScript as a standard field-bound PCF control.

The manifest defines two properties:

- `phoneNumber`: the bound Dataverse phone field.
- `defaultRegion`: an optional input property used to interpret local numbers.

The control itself keeps two representations of the value in play:

- A formatted display value for the user.
- A normalized E.164 value for Dataverse.

That distinction is the key design choice. The user should see a number that is easy to read, but the database should receive a value optimized for consistency and interoperability.

## Parsing and Dialing

The control uses `libphonenumber-js`, which is a practical choice because it handles country-aware parsing, validation, and international formatting.

The flow is straightforward:

1. Capture the raw input from the user.
2. Apply as-you-type formatting for readability.
3. Try to parse the number with the configured region when needed.
4. If the number is valid, return the E.164 representation through `getOutputs()`.
5. If the number is invalid, show a visible error message and keep the current text in place.
6. On blur, update the visible value to a polished international display format when possible.

The call button first tries the Dynamics Contact Center dialer through `Microsoft.CIFramework`. If that API is available in the host, the control uses it. If not, it falls back to a standard `tel:` action.

That is the piece that matters for Contact Center scenarios. When the host exposes the CIF/CIFramework APIs, the control does not try to invent its own calling experience.

## Example

Imagine a user in the Netherlands enters:

`06 39 89 61 34`

If the control has `defaultRegion = NL`, it can understand that the number is Dutch even though the user did not type `+31`.

The result can then be:

- Displayed to the user as: `+31 6 39896134`
- Stored in Dataverse as: `+31639896134`

That is exactly the kind of conversion this control is intended to handle.

## Benefits

The biggest advantage is that users do not need to be trained on phone-number standards. They can type naturally, and the control handles normalization for them.

Beyond that, the control helps with:

- Better data quality in Dataverse.
- More reliable outbound integrations.
- Consistent formatting across forms.
- Clearer validation when a number is wrong.
- A better user experience on phone number fields.

It is a small component, but it improves both usability and data integrity in a place where organizations often accumulate avoidable inconsistency.

## Packaging

To deploy this control, build the PCF project and package it as a managed Dataverse solution.

For this repository, the managed package is generated at:

- `pcfsolution/bin/Debug/pcfsolution_1.0.6_managed.zip`

That is the file to import when updating the currently deployed solution.

## Verification

After importing the managed solution and binding the control to a phone field:

1. Verify solution import completed successfully.
2. Verify the control is active on the phone field and the form is published.
3. Enter local and international numbers and save the record.
4. Confirm the displayed value is cleanly formatted.
5. Confirm invalid values show a message instead of silently reverting.
6. Confirm the call button uses the Contact Center dialer when `CIFramework` is available.
7. Confirm the stored Dataverse value is E.164.

This keeps the control easy to maintain and easy to extend.

## Final Thoughts

Phone numbers are one of those data types that look simple until they start creating operational friction.

This control keeps the input experience forgiving, the validation visible, the stored value strict, and the calling behavior aligned with Contact Center when the host supports it.

If you are building model-driven apps and care about clean customer data, this is the kind of small UX improvement that pays off quickly.