

### mainnet
cargo run --release --bin kaspad -- --utxoindex --disable-upnp --maxinpeers=64 --perf-metrics --outpeers=32 --yes --perf-metrics-interval-sec=1 --rpclisten=127.0.0.1:16110 --rpclisten-borsh=127.0.0.1:17110 --rpclisten-json=127.0.0.1:18110


### testnet-11
cargo run --release --bin kaspad -- --utxoindex --testnet --disable-upnp --maxinpeers=64 --perf-metrics --outpeers=32 --yes --perf-metrics-interval-sec=1 --rpclisten=127.0.0.1:16110 --rpclisten-borsh=127.0.0.1:17110 --rpclisten-json=127.0.0.1:18110






curl --location '127.0.0.1:3000/wallet/balance' \
--header 'Content-Type: application/json' \
--data '{
"privateKey":"ef20e4684a48528faf7a73cafed5fb97bbf89e597a4ced6c9ceaa829cf362cbf"
}'