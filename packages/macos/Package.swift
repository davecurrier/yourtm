// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "YourTM",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "YourTM",
            path: "Sources/YourTM",
            exclude: ["Resources"],
            resources: []
        )
    ]
)
