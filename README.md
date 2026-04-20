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

Modify [docker-compose](./docker/docker-compose.yml) with your relevant [env](#env-variables) variables.  The run `docker compose -f docker-compose.yml up`.

Run at startup:

Put your (modified) [docker-compose](./docker/docker-compose.yml) in `$HOME/signal/docker`.  Place your [service](./service/llm-signal.service) in `~/.config/systemd/user/`.

Then:

```sh
systemctl --user enable llm-signal
systemctl --user start llm-signal
sudo loginctl enable-linger $USER
```

### Env variables

* ANTHROPIC_BASE_URL (defaults to "http://host.docker.internal:11434", local Ollama)
* ANTHROPIC_AUTH_TOKEN (defaults to "ollama")
* ANTHROPIC_API_KEY (defaults to "sk-local-dummy")
* LOG_LEVEL (defaults to "info")
* START_THINK_TOKEN (start token for thinking, defaults to "<think>")
* END_THINK_TOKEN (start token for thinking, defaults to "</think>")
* SIGNAL_BOT_PHONE_NUMBER (your free phone number from Google)
* SIGNAL_USER_ADMIN_NUMBER (your actual phone number)
* SIGNAL_REST_ENDPOINT (endpoint exposed by signal server docker, defaults to http://localhost:9001)

## Develop

### Run signal server locally

```sh
docker run  -p 9001:8080 \
    -v $HOME/.local/share/signal-cli:/home/.local/share/signal-cli \
    -e MODE=json-rpc-native bbernhard/signal-cli-rest-api:latest-rootless-dev
```

### Env variables

Create a .env in the project directory with the following entries

```sh
SIGNAL_BOT_PHONE_NUMBER="free_phone_number_you_got_from_google"
SIGNAL_USER_ADMIN_NUMBER="your_actual_phone_number"
ANTHROPIC_BASE_URL="URL for your hosted model"
```

### Run

```sh
node index.ts
```
