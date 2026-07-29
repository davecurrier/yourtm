<?php
/**
 * Admin settings page template.
 *
 * Deliberately plain: core Settings API markup (.wrap / .form-table / .widefat)
 * so the screen inherits WordPress admin styling, dark mode, RTL and
 * accessibility for free instead of reimplementing them.
 *
 * @package YourTM_Tag_Manager
 *
 * Variables available:
 * @var array $bundle_info     Bundle status info.
 * @var array $detected_caches Detected cache systems.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$has_api_key = ! empty( get_option( 'yourtm_api_key', '' ) );
?>
<div class="wrap">
	<h1><?php esc_html_e( 'YourTM Tag Manager', 'yourtm-tag-manager' ); ?></h1>

	<?php /* .yourtm-dot is neutral grey until admin.js resolves the real state; .yourtm-status-text is a JS hook. */ ?>
	<p class="yourtm-status" id="yourtm-connection-status">
		<span class="yourtm-dot"></span>
		<span class="yourtm-status-text"><?php esc_html_e( 'Checking status…', 'yourtm-tag-manager' ); ?></span>
	</p>

	<h2><?php esc_html_e( 'Bundle', 'yourtm-tag-manager' ); ?></h2>
	<table class="widefat striped" style="max-width:40em">
		<tbody>
			<tr>
				<th scope="row"><?php esc_html_e( 'Status', 'yourtm-tag-manager' ); ?></th>
				<td>
					<?php if ( $bundle_info['exists'] ) : ?>
						<?php esc_html_e( 'Active — served locally (same-origin)', 'yourtm-tag-manager' ); ?>
					<?php else : ?>
						<?php esc_html_e( 'No bundle synced — falling back to CDN', 'yourtm-tag-manager' ); ?>
					<?php endif; ?>
				</td>
			</tr>
			<tr>
				<th scope="row"><?php esc_html_e( 'Version', 'yourtm-tag-manager' ); ?></th>
				<td id="yourtm-bundle-version"><?php echo esc_html( $bundle_info['version'] ? $bundle_info['version'] : '—' ); ?></td>
			</tr>
			<tr>
				<th scope="row"><?php esc_html_e( 'Size', 'yourtm-tag-manager' ); ?></th>
				<td><?php echo $bundle_info['size'] > 0 ? esc_html( size_format( $bundle_info['size'] ) ) : '—'; ?></td>
			</tr>
			<tr>
				<th scope="row"><?php esc_html_e( 'Last sync', 'yourtm-tag-manager' ); ?></th>
				<td id="yourtm-last-sync"><?php echo ! empty( $bundle_info['last_sync'] ) ? esc_html( $bundle_info['last_sync'] ) : '—'; ?></td>
			</tr>
		</tbody>
	</table>

	<p>
		<button type="button" class="button button-primary" id="yourtm-sync-now">
			<?php esc_html_e( 'Sync Now', 'yourtm-tag-manager' ); ?>
		</button>
		<button type="button" class="button" id="yourtm-test-connection">
			<?php esc_html_e( 'Check Status', 'yourtm-tag-manager' ); ?>
		</button>
		<span id="yourtm-sync-result" class="yourtm-message"></span>
		<span id="yourtm-test-result" class="yourtm-message"></span>
	</p>

	<form method="post" action="options.php">
		<?php settings_fields( 'yourtm_settings' ); ?>

		<h2><?php esc_html_e( 'Connection', 'yourtm-tag-manager' ); ?></h2>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><label for="yourtm_container_id"><?php esc_html_e( 'Container ID', 'yourtm-tag-manager' ); ?></label></th>
				<td>
					<input type="text" id="yourtm_container_id" name="yourtm_container_id" class="regular-text"
						   value="<?php echo esc_attr( get_option( 'yourtm_container_id', '' ) ); ?>"
						   placeholder="YTM-ABC123" />
				</td>
			</tr>
			<tr>
				<th scope="row"><label for="yourtm_api_key"><?php esc_html_e( 'API Key', 'yourtm-tag-manager' ); ?></label></th>
				<td>
					<?php /* The key itself is never rendered. Submitting blank keeps the stored value — see YourTM_Admin::sanitize_api_key(). */ ?>
					<input type="password" id="yourtm_api_key" name="yourtm_api_key" class="regular-text"
						   value="" autocomplete="off"
						   placeholder="<?php echo $has_api_key
								? esc_attr__( 'Saved — leave blank to keep it', 'yourtm-tag-manager' )
								: esc_attr__( 'ytm_key_…', 'yourtm-tag-manager' ); ?>" />
					<p class="description"><?php esc_html_e( 'Shared between WordPress and the YourTM app. Leave blank to keep the existing key.', 'yourtm-tag-manager' ); ?></p>
				</td>
			</tr>
			<tr>
				<th scope="row"><label for="yourtm_bundle_url"><?php esc_html_e( 'Bundle URL', 'yourtm-tag-manager' ); ?></label></th>
				<td>
					<input type="url" id="yourtm_bundle_url" name="yourtm_bundle_url" class="regular-text"
						   value="<?php echo esc_attr( get_option( 'yourtm_bundle_url', '' ) ); ?>"
						   placeholder="https://pub-xxxx.r2.dev" />
					<p class="description"><?php esc_html_e( 'Public CDN URL bundles are pulled from on sync.', 'yourtm-tag-manager' ); ?></p>
				</td>
			</tr>
			<tr>
				<th scope="row"><?php esc_html_e( 'Auto-sync', 'yourtm-tag-manager' ); ?></th>
				<td>
					<fieldset>
						<label>
							<input type="checkbox" name="yourtm_auto_sync" value="1" <?php checked( get_option( 'yourtm_auto_sync', '0' ), '1' ); ?> />
							<?php esc_html_e( 'Pull the bundle on a schedule', 'yourtm-tag-manager' ); ?>
						</label>
						<p class="description"><?php esc_html_e( 'A backstop. Deploys normally push the bundle straight to this site; this catches a push that failed.', 'yourtm-tag-manager' ); ?></p>
						<p>
							<label for="yourtm_sync_interval" class="screen-reader-text"><?php esc_html_e( 'Sync interval', 'yourtm-tag-manager' ); ?></label>
							<select id="yourtm_sync_interval" name="yourtm_sync_interval">
								<?php
								$interval  = get_option( 'yourtm_sync_interval', 'twicedaily' );
								$intervals = array(
									'hourly'     => __( 'Hourly', 'yourtm-tag-manager' ),
									'twicedaily' => __( 'Twice daily', 'yourtm-tag-manager' ),
									'daily'      => __( 'Daily', 'yourtm-tag-manager' ),
								);
								foreach ( $intervals as $value => $label ) {
									printf(
										'<option value="%s" %s>%s</option>',
										esc_attr( $value ),
										selected( $interval, $value, false ),
										esc_html( $label )
									);
								}
								?>
							</select>
						</p>
					</fieldset>
				</td>
			</tr>
		</table>

		<h2><?php esc_html_e( 'Script Output', 'yourtm-tag-manager' ); ?></h2>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><label for="yourtm_script_position"><?php esc_html_e( 'Position', 'yourtm-tag-manager' ); ?></label></th>
				<td>
					<select id="yourtm_script_position" name="yourtm_script_position">
						<option value="head" <?php selected( get_option( 'yourtm_script_position', 'head' ), 'head' ); ?>><?php esc_html_e( 'Head (recommended)', 'yourtm-tag-manager' ); ?></option>
						<option value="footer" <?php selected( get_option( 'yourtm_script_position', 'head' ), 'footer' ); ?>><?php esc_html_e( 'Footer', 'yourtm-tag-manager' ); ?></option>
					</select>
				</td>
			</tr>
			<tr>
				<th scope="row"><label for="yourtm_script_loading"><?php esc_html_e( 'Loading', 'yourtm-tag-manager' ); ?></label></th>
				<td>
					<select id="yourtm_script_loading" name="yourtm_script_loading">
						<option value="defer" <?php selected( get_option( 'yourtm_script_loading', 'defer' ), 'defer' ); ?>><?php esc_html_e( 'Defer (recommended)', 'yourtm-tag-manager' ); ?></option>
						<option value="async" <?php selected( get_option( 'yourtm_script_loading', 'defer' ), 'async' ); ?>><?php esc_html_e( 'Async', 'yourtm-tag-manager' ); ?></option>
						<option value="blocking" <?php selected( get_option( 'yourtm_script_loading', 'defer' ), 'blocking' ); ?>><?php esc_html_e( 'Blocking', 'yourtm-tag-manager' ); ?></option>
					</select>
					<p class="description"><?php esc_html_e( 'Defer keeps the core runtime and zone bundles executing in order. Async gives no ordering guarantee, so it is treated as Defer whenever zone bundles are present.', 'yourtm-tag-manager' ); ?></p>
				</td>
			</tr>
			<tr>
				<th scope="row"><?php esc_html_e( 'Exclusions', 'yourtm-tag-manager' ); ?></th>
				<td>
					<fieldset>
						<label>
							<input type="checkbox" name="yourtm_disable_for_admins" value="1" <?php checked( get_option( 'yourtm_disable_for_admins', '0' ), '1' ); ?> />
							<?php esc_html_e( 'Do not load for logged-in administrators', 'yourtm-tag-manager' ); ?>
						</label><br />
						<label>
							<input type="checkbox" name="yourtm_disable_on_preview" value="1" <?php checked( get_option( 'yourtm_disable_on_preview', '1' ), '1' ); ?> />
							<?php esc_html_e( 'Do not load on WordPress preview pages', 'yourtm-tag-manager' ); ?>
						</label>
					</fieldset>
				</td>
			</tr>
		</table>

		<h2><?php esc_html_e( 'DataLayer Enrichment', 'yourtm-tag-manager' ); ?></h2>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><?php esc_html_e( 'Enrichment', 'yourtm-tag-manager' ); ?></th>
				<td>
					<fieldset>
						<label>
							<input type="checkbox" name="yourtm_datalayer_enabled" value="1" <?php checked( get_option( 'yourtm_datalayer_enabled', '0' ), '1' ); ?> />
							<?php esc_html_e( 'Push WordPress page context into window.dataLayer', 'yourtm-tag-manager' ); ?>
						</label>
						<p class="description"><?php esc_html_e( 'Emits nested page.*, site.*, user.* and ecommerce.* objects before the bundle loads. Leave off unless your container has variables that read those keys — otherwise it is page weight nothing consumes.', 'yourtm-tag-manager' ); ?></p>
					</fieldset>
				</td>
			</tr>
			<tr>
				<th scope="row"><?php esc_html_e( 'Fields', 'yourtm-tag-manager' ); ?></th>
				<td>
					<fieldset>
						<?php
						$current_fields = get_option( 'yourtm_datalayer_fields', array( 'page', 'site', 'user' ) );
						if ( ! is_array( $current_fields ) ) {
							$current_fields = array( 'page', 'site', 'user' );
						}
						$field_options = array(
							'page'      => __( 'Page — type, title, template, categories, tags', 'yourtm-tag-manager' ),
							'site'      => __( 'Site — name, language, multisite status', 'yourtm-tag-manager' ),
							'user'      => __( 'User — login status, role, hashed ID (never PII)', 'yourtm-tag-manager' ),
							'ecommerce' => __( 'E-commerce — product, cart and purchase data (WooCommerce)', 'yourtm-tag-manager' ),
						);
						foreach ( $field_options as $key => $label ) :
							?>
							<label>
								<input type="checkbox" name="yourtm_datalayer_fields[]" value="<?php echo esc_attr( $key ); ?>"
									   <?php checked( in_array( $key, $current_fields, true ) ); ?> />
								<?php echo esc_html( $label ); ?>
							</label><br />
						<?php endforeach; ?>
					</fieldset>
				</td>
			</tr>
		</table>

		<h2><?php esc_html_e( 'Caching', 'yourtm-tag-manager' ); ?></h2>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><?php esc_html_e( 'Detected caches', 'yourtm-tag-manager' ); ?></th>
				<td>
					<?php if ( ! empty( $detected_caches ) ) : ?>
						<p><?php echo esc_html( implode( ', ', $detected_caches ) ); ?></p>
						<p class="description"><?php esc_html_e( 'Purged automatically after each sync.', 'yourtm-tag-manager' ); ?></p>
					<?php else : ?>
						<p class="description"><?php esc_html_e( 'None detected.', 'yourtm-tag-manager' ); ?></p>
					<?php endif; ?>
				</td>
			</tr>
		</table>

		<?php submit_button(); ?>
	</form>
</div>
