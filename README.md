

### mainnet
cargo run --release --bin kaspad -- --utxoindex --disable-upnp --maxinpeers=64 --perf-metrics --outpeers=32 --yes --perf-metrics-interval-sec=1 --rpclisten=127.0.0.1:16110 --rpclisten-borsh=127.0.0.1:17110 --rpclisten-json=127.0.0.1:18110


### testnet-11
cargo run --release --bin kaspad -- --utxoindex --testnet --disable-upnp --maxinpeers=64 --perf-metrics --outpeers=32 --yes --perf-metrics-interval-sec=1 --rpclisten=127.0.0.1:16110 --rpclisten-borsh=127.0.0.1:17110 --rpclisten-json=127.0.0.1:18110



ws://13.229.203.148:17110
2024-11-30 06:37:42.343+00:00 [INFO ] GRPC Server starting on: 127.0.0.1:16110
2024-11-30 06:37:42.343+00:00 [INFO ] P2P Server starting on: 0.0.0.0:16111
2024-11-30 06:37:42.343+00:00 [INFO ] WRPC Server starting on: 127.0.0.1:17110
2024-11-30 06:37:42.343+00:00 [INFO ] WRPC Server starting on: 127.0.0.1:18110



