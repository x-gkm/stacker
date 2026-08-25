{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs?ref=nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    naersk = {
      url = "github:nix-community/naersk";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      perSystem =
        {
          system,
          config,
          pkgs,
          inputs',
          ...
        }:
        let
          toolchain = pkgs.rust-bin.stable.latest.default.override {
            extensions = [ "rust-src" ];
          };

          naersk' = pkgs.callPackage inputs.naersk {
            rustc = toolchain;
            cargo = toolchain;
          };

          buildInputs = [ pkgs.alsa-lib ];
        in
        {
          _module.args.pkgs = import inputs.nixpkgs {
            inherit system;
            overlays = [
              inputs.rust-overlay.overlays.default
            ];
          };

          packages.default = naersk'.buildPackage {
            src = ./.;
            inherit buildInputs;
          };

          devShells.default = pkgs.mkShell {
            nativeBuildInputs = [
              toolchain
            ];

            inherit buildInputs;

            # https://github.com/not-fl3/macroquad/issues/641#issuecomment-1760137883
            LD_LIBRARY_PATH = builtins.concatStringsSep ":" [
              "${pkgs.libx11}/lib"
              "${pkgs.libxi}/lib"
              "${pkgs.libGL}/lib"
              "${pkgs.libxkbcommon}/lib"
            ];
          };
        };
    };
}
