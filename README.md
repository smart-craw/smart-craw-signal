## Set up Signal

### Get a free phone number from Google

If you have a Google account you can create a new free phone number.

### Install openjdk on mac

`brew install openjdk`

### Register (sends SMS verification code)

`./node_modules/signal-sdk/bin/signal-cli -a +1[number] register`

### Verify with the code received

`./node_modules/signal-sdk/bin/signal-cli -a +1[number] verify [number]`

## Develop

### Env variables

Create a .env in the project directory with the following entries"

```sh
SIGNAL_BOT_PHONE_NUMBER="free_phone_number_you_got_from_google"
SIGNAL_USER_ADMIN_NUMBER="your_actual_phone_number"
ANTHROPIC_BASE_URL="URL for your hosted model"
```
