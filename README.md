# Phone Number PCF Control

This project contains a Microsoft Power Apps Component Framework control for Dynamics 365 phone number columns.

## Behavior

- Users can type phone numbers in a loose format, including spaces, punctuation, or local notation.
- The control formats the visible value into a cleaner international display while typing and on blur.
- The bound Dataverse column is written back in E.164 format, for example `+31639896134`.
- For local numbers without a `+` prefix, configure the `defaultRegion` input property with a two-letter ISO code such as `NL`.

## Local development

The workspace expects Node.js, npm, and the Power Platform PCF toolchain packages listed in `package.json`.

1. Install dependencies with `npm install`.
2. Build the control with `npm run build`.
3. Use the normal PCF packaging flow to add the control to a Dataverse solution.

## Install in a Dataverse environment

See [INSTALLATION.md](INSTALLATION.md) for full step-by-step deployment instructions.

## Bound properties

- `phoneNumber`: bound to a Dataverse phone number column.
- `defaultRegion`: optional ISO region code used to interpret local numbers, for example `NL`, `BE`, or `DE`.