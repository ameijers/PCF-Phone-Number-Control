# Install in a Dataverse environment

This package is meant to be imported as a managed solution update into an existing Dataverse environment.

## Prerequisites

You need the following tools installed:

- Node.js LTS and npm
- .NET SDK
- Power Platform CLI (`pac`)

On macOS, install Power Platform CLI with:

```bash
dotnet tool install --global Microsoft.PowerApps.CLI.Tool --version 1.52.1
```

If the `.NET` global tools folder is not already on your path, add it to `~/.zprofile`:

```bash
cat << 'EOF' >> ~/.zprofile
# Add .NET global tools
export PATH="$PATH:$HOME/.dotnet/tools"
EOF
source ~/.zprofile
```

Version `1.52.1` is the fallback that has been working reliably on macOS in this workspace.

Verify the toolchain:

```bash
node -v
npm -v
dotnet --version
pac
```

## Build the PCF control

From the project root:

```bash
npm install
npm run build
```

This builds `Promethean.Academy.Controls.PhoneNumberControl`.

## Create the managed solution package

The solution project is already set up in `pcfsolution`.

Build the managed package with:

```bash
cd pcfsolution
dotnet build /p:SolutionPackageType=Managed
```

The managed solution zip is generated at:

`pcfsolution/bin/Debug/pcfsolution.zip`

For convenience, this workspace also keeps a versioned copy here:

`pcfsolution/bin/Debug/pcfsolution_1.0.6_managed.zip`

That is the file to use when updating an existing deployed solution.

## Import the update

1. Go to `https://make.powerapps.com` and select the target environment.
2. Open **Solutions**.
3. Select **Import solution**.
4. Upload `pcfsolution_1.0.6_managed.zip`.
5. Complete the import.

Because this is a managed package, it should be used for production-style environments and for upgrading the deployed solution.

## Attach the control to a phone field

1. Open the table and form where the phone field lives.
2. Select the phone number column.
3. Add a custom control and choose `PA Phone Number (E.164)`.
4. Map `Phone Number` to the phone column.
5. Optionally set `Default Region` to a static region code such as `NL`, `US`, or `BE`.

If users enter local numbers without a `+` prefix, the default region helps the control interpret the value correctly.

## What to verify after import

1. The solution import completes successfully.
2. The form shows the updated phone control.
3. Invalid numbers stay visible and show an error message instead of silently reverting.
4. The call button is visible and uses the Dynamics Contact Center dialer when `CIFramework` is available.
5. The value saved to Dataverse is normalized to E.164.

## Upgrade process

When you change the control again, follow the same sequence:

1. Increase the version in `ControlManifest.Input.xml`.
2. Increase the solution version in `pcfsolution/src/Other/Solution.xml`.
3. Rebuild the PCF project.
4. Rebuild the managed solution package.
5. Import the new managed zip into the target environment.
