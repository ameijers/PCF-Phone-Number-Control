# Install in a Dataverse environment

Follow these steps to package and install this PCF control in Dynamics 365 / Power Apps.

## 1. Prerequisites

Install and verify the following tools:

- Node.js LTS and npm
- .NET SDK
- Power Platform CLI (`pac`)

Install Power Platform CLI on macOS:

```bash
dotnet tool install --global Microsoft.PowerApps.CLI.Tool --version 1.52.1
```

Add the global .NET tools folder to your zsh PATH:

```bash
cat << 'EOF' >> ~/.zprofile
# Add .NET global tools
export PATH="$PATH:$HOME/.dotnet/tools"
EOF
source ~/.zprofile
```

Note: Newer PAC package versions are currently failing with `DotnetToolSettings.xml` errors in dotnet tool install. Version `1.52.1` is a confirmed working fallback on macOS.

Verify your setup:

```bash
node -v
npm -v
dotnet --version
pac
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

Create a folder for packaging and initialize a Dataverse solution project.

Important: `--publisher-name` cannot contain spaces.

```bash
mkdir pcfsolution
cd pcfsolution
pac solution init --publisher-name "PrometheanAcademy" --publisher-prefix "pa"
```

## 5. Add this PCF project to the solution

From inside the solution folder, add the repository PCF project file:

```bash
pac solution add-reference --path ../PhoneNumberControl.pcfproj
```

This repository includes `PhoneNumberControl.pcfproj` for solution packaging.

## 6. Build the solution package

```bash
dotnet build
```

This generates the unmanaged solution `.zip` in:

`pcfsolution/bin/Debug/pcfsolution.zip`

For a managed package, run:

```bash
dotnet build /p:SolutionPackageType=Managed
```

Managed output location is the same file path:

`pcfsolution/bin/Debug/pcfsolution.zip`

If you need both files, copy/rename the unmanaged zip before running the managed build.

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
3. Add a custom control and choose `PA Phone Number (E.164)`.
4. In component properties, map `Phone Number` to the current phone column.
5. For `Default Region (Static, Optional)`, use a static value like `NL` or `US` if users type local numbers without `+`.

Notes about the property pane:
- The checkbox enables that property mapping for the current form factor.
- The `Static` input means you are supplying a fixed text value directly (recommended for `Default Region`).
- If `Static` is left empty, locale auto-detection is used as fallback.
5. Save and publish.

## 9. Validate

1. Confirm solution import status is **Success** in the Power Apps maker portal.
2. Confirm the custom control is attached to the target phone column and published.
3. Enter a local number (without `+`) and an international number (with `+`).
4. Save the record and reopen it.
5. Confirm the displayed value is readable and formatted.
6. Confirm the stored Dataverse value is E.164 (for example `+31639896134`).
7. Enter an invalid value and verify it is not persisted as a valid E.164 value.

## 10. Upgrade process

When updating the control:

1. Increase the control version in `ControlManifest.Input.xml`.
2. Rebuild the PCF project and solution package.
3. Re-import the updated solution.
