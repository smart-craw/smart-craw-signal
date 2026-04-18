## Set up Signal

### Get a free phone number from Google

If you have a Google account you can create a new free phone number.

### Install openjdk on mac

`brew install openjdk`

### Register (sends SMS verification code)

`./node_modules/signal-sdk/bin/signal-cli -a +1[number] register`

### Verify with the code received

`./node_modules/signal-sdk/bin/signal-cli -a +1[number] verify [number]`

## Run

Run in a terminal:

```sh
# create a place for claude to put persistent files
mkdir memory
```

```sh
docker run \
-v $(pwd):/app/mounts \
-v $(pwd)/memory:/home/node/.claude \
-e ANTHROPIC_BASE_URL=[yourllmurl] \
-e ANTHROPIC_AUTH_TOKEN=[yourauthtoken] \
-e ANTHROPIC_API_KEY=[yourapikey] \
-e SIGNAL_BOT_PHONE_NUMBER=[yourbotphonenumber] \
-e SIGNAL_USER_ADMIN_NUMBER=[yourrealphonenumber] \
--add-host=host.docker.internal:host-gateway \
ghcr.io/smart-craw/smart-craw-signal:v0.0.1
```

Run at startup:

Place your (modified) [service](./service/llm-signal.service) in `/etc/systemd/system`.

Then:

```sh
systemctl enable llm-signal
systemctl start llm-signal
```


## Develop

### Env variables

Create a .env in the project directory with the following entries"

```sh
SIGNAL_BOT_PHONE_NUMBER="free_phone_number_you_got_from_google"
SIGNAL_USER_ADMIN_NUMBER="your_actual_phone_number"
ANTHROPIC_BASE_URL="URL for your hosted model"
```
