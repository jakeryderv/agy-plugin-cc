# companion-contract

## MODIFIED Requirements

### Requirement: Model and effort values are validated before agy is invoked
A `--model` value SHALL be validated against the live `agy models` listing, and
an unknown value SHALL fail with the available models printed. A `--effort`
value SHALL be one of `low`, `medium`, or `high`. Model names MUST NOT be
hardcoded in plugin logic.

`--model` and `--effort` SHALL NOT be accepted together. agy encodes the effort
tier in the model name for the models that support tiering, and rejects the
flag outright for those that do not, so no combination of the two can succeed.
Supplying both SHALL be a usage error that states they are alternatives, raised
before agy is invoked so no live call is spent on an invocation that cannot
work.

#### Scenario: Unknown model reports the live list
- **WHEN** a task subcommand is given a model name absent from the live listing
- **THEN** it exits 64 and prints the available model names

#### Scenario: Model listing unavailable does not block the run
- **WHEN** `agy models` fails, so no listing can be obtained
- **THEN** validation accepts the supplied model and lets agy report the problem, rather than blocking on an availability outage

#### Scenario: Model and effort together are rejected
- **WHEN** a task subcommand is given both a model and an effort
- **THEN** it exits 64 explaining that the two are alternatives, and agy is never invoked

#### Scenario: Either flag alone is accepted
- **WHEN** a task subcommand is given a valid model without an effort, or an effort without a model
- **THEN** validation passes and the run proceeds
