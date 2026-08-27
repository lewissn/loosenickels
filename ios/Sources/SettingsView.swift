import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var settings: Settings
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Owner", text: $settings.repository.owner)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Repository", text: $settings.repository.name)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Branch", text: $settings.repository.branch)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Repository")
                } footer: {
                    Text("Records are written to src/content/records, photographs to public/media.")
                }

                Section {
                    SecureField("Fine-grained token", text: $settings.token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Access token")
                } footer: {
                    Text("A fine-grained personal access token with Contents: read and write, on this repository only. Held in the keychain.")
                }

                Section {
                    TextField("Site", text: $settings.repository.site)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                } header: {
                    Text("Deployed site")
                } footer: {
                    Text("Asked, before filing, whether a slug is already in use. Nothing else depends on it.")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
