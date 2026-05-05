# Install in a Dataverse environment

Follow these steps to package and install this PCF control in Dynamics 365 / Power Apps.

## 1. Prerequisites

Install and verify the following tools:

- Node.js LTS and npm
- .NET SDK
- Power Platform CLI (`pac`)

Install Power Platform CLI:

```bash
dotnet tool install --global Microsoft.PowerApps.CLI.Tool
```

Verify your setup:

```bash
node -v
npm -v
dotnet --version
pac --version
```

## 2. Build the PCF control

From this project root:

```bash
npm install
npm run build
```

This builds `Promethean.Academy.Controls.PhoneNumberControl`.

## 3. Authenticate to your Dataverse environment

```bash
pac auth create --environment https://YOURORG.crm.dynamics.com
pac auth list
```

If you have multiple profiles, select the right one:

```bash
pac auth select --index 1
```

## 4. Create a solution packaging project

Create a folder for packaging and initialize a Dataverse solution project:

```bash
mkdir pcf-solution
cd pcf-solution
pac solution init --publisher-name "Your Publisher" --publisher-prefix "yp"
```

## 5. Add this PCF project to the solution

From inside the solution folder:

```bash
pac solution add-reference --path ../
```

Adjust the path if your folder structure differs.

## 6. Build the solution package

```bash
dotnet build
```

This generates managed and unmanaged solution `.zip` files in the build output.

## 7. Import the solution

1. Go to `https://make.powerapps.com` and select your target environment.
2. Open **Solutions**.
3. Select **Import solution**.
4. Upload the generated solution `.zip`.
5. Complete import.

Use unmanaged in development/test and managed in production.

## 8. Attach the control to a phone column

1. Open the target table and form.
2. Select the phone number field.
3. Add a custom control and choose this Phone Number PCF control.
4. Configure `defaultRegion` (for example `NL`, `BE`, or `DE`) when users enter local numbers.
5. Save and publish.

## 9. Validate

1. Enter local and international phone numbers.
2. Confirm user-friendly formatted display.
3. Confirm stored value is E.164 (for example `+31639896134`).

## 10. Upgrade process

When updating the control:

1. Increase the control version in `ControlManifest.Input.xml`.
2. Rebuild the PCF project and solution package.
3. Re-import the updated solution.
