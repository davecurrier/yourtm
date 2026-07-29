<?php
/**
 * Bundle manager: sync, store, and serve compiled tag bundles.
 *
 * @package YourTM_Tag_Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class YourTM_Bundle {

	/**
	 * Cache manager instance.
	 *
	 * @var YourTM_Cache
	 */
	private $cache;

	/**
	 * Script handle used with wp_enqueue_script.
	 *
	 * @var string
	 */
	const SCRIPT_HANDLE = 'yourtm-bundle';

	/**
	 * Constructor.
	 *
	 * @param YourTM_Cache $cache Cache manager.
	 */
	public function __construct( YourTM_Cache $cache ) {
		$this->cache = $cache;

		// Resource preload hint for the bundle.
		add_action( 'wp_head', array( $this, 'output_preload_hint' ), 1 );
	}

	// ------------------------------------------------------------------
	// Sync
	// ------------------------------------------------------------------

	/**
	 * Sync the bundle from Cloudflare R2.
	 *
	 * @return array{success: bool, message: string, version?: string}
	 */
	public function sync_bundle() {
		$container_id = get_option( 'yourtm_container_id', '' );
		$bundle_url   = get_option( 'yourtm_bundle_url', '' );
		$environment  = get_option( 'yourtm_environment', 'production' );

		if ( empty( $container_id ) ) {
			return array(
				'success' => false,
				'message' => __( 'Container ID is required.', 'yourtm-tag-manager' ),
			);
		}

		if ( empty( $bundle_url ) ) {
			return array(
				'success' => false,
				'message' => __( 'Bundle URL is required. Enter your Cloudflare R2 public URL.', 'yourtm-tag-manager' ),
			);
		}

		/** Action before sync starts. */
		do_action( 'yourtm_before_bundle_sync' );

		// Pull from R2.
		$result = $this->sync_from_r2( $bundle_url, $container_id, $environment );

		if ( $result['success'] ) {
			update_option( 'yourtm_sync_fail_count', 0 );
			delete_option( 'yourtm_last_sync_error' );
			do_action( 'yourtm_after_bundle_sync', $result );
			return $result;
		}

		// Track failure.
		$fail_count = (int) get_option( 'yourtm_sync_fail_count', 0 );
		update_option( 'yourtm_sync_fail_count', $fail_count + 1 );
		update_option( 'yourtm_last_sync_error', $result['message'] );

		return $result;
	}

	/**
	 * Pull bundle from Cloudflare R2.
	 *
	 * Tries: {url}/{environment}/core.js, then {url}/latest/core.js
	 *
	 * @param string $bundle_url R2 public URL.
	 * @param string $container_id Container ID.
	 * @param string $environment Environment name.
	 * @return array{success: bool, message: string, version?: string}
	 */
	private function sync_from_r2( $bundle_url, $container_id, $environment ) {
		$base = trailingslashit( $bundle_url );

		// Determine the base path (try environment first, then latest).
		$base_path = '';
		foreach ( array( $environment, 'latest' ) as $prefix ) {
			$test_url  = $base . $prefix . '/core.js';
			$response  = wp_remote_get( $test_url, array( 'timeout' => 30 ) );
			if ( ! is_wp_error( $response ) && 200 === wp_remote_retrieve_response_code( $response ) ) {
				$base_path = $prefix;
				break;
			}
		}

		if ( empty( $base_path ) ) {
			return array(
				'success' => false,
				'message' => __( 'Bundle sync failed: no bundle found at R2 URL.', 'yourtm-tag-manager' ),
			);
		}

		// Pull core.js (required).
		$core_url  = $base . $base_path . '/core.js';
		$core_resp = wp_remote_get( $core_url, array( 'timeout' => 30 ) );
		if ( is_wp_error( $core_resp ) || 200 !== wp_remote_retrieve_response_code( $core_resp ) ) {
			return array(
				'success' => false,
				'message' => __( 'Bundle sync failed: could not fetch core.js.', 'yourtm-tag-manager' ),
			);
		}

		$core_code = wp_remote_retrieve_body( $core_resp );
		$hash      = substr( hash( 'sha256', $core_code ), 0, 12 );
		$bundles   = array(
			array(
				'name' => 'core.js',
				'code' => $core_code,
				'hash' => $hash,
				'size' => strlen( $core_code ),
			),
		);

		// Try to pull zone files (optional — they may not exist).
		$zone_names = array( 'zone-global', 'zone-higher-ed' );

		/**
		 * Filter the list of zone bundle names to sync from R2.
		 *
		 * @param string[] $zone_names Zone file basenames (without .js).
		 * @param string   $container_id Container ID.
		 */
		$zone_names = apply_filters( 'yourtm_sync_zone_names', $zone_names, $container_id );

		foreach ( $zone_names as $zone_name ) {
			$zone_url  = $base . $base_path . '/' . $zone_name . '.js';
			$zone_resp = wp_remote_get( $zone_url, array( 'timeout' => 15 ) );
			if ( ! is_wp_error( $zone_resp ) && 200 === wp_remote_retrieve_response_code( $zone_resp ) ) {
				$zone_code = wp_remote_retrieve_body( $zone_resp );
				$bundles[] = array(
					'name' => $zone_name . '.js',
					'code' => $zone_code,
					'hash' => substr( hash( 'sha256', $zone_code ), 0, 12 ),
					'size' => strlen( $zone_code ),
				);
			}
		}

		return $this->store_bundles( $container_id, $bundles, $hash );
	}

	/**
	 * Write bundle files to disk and update options.
	 *
	 * @param string $container_id Container ID.
	 * @param array  $bundles Array of bundle objects with name, code, hash, size.
	 * @param string $version Version identifier.
	 * @return array{success: bool, message: string, version?: string}
	 */
	private function store_bundles( $container_id, $bundles, $version ) {
		$dir = YourTM_Tag_Manager::get_bundle_dir() . sanitize_file_name( $container_id ) . '/';

		if ( ! file_exists( $dir ) ) {
			wp_mkdir_p( $dir );
		}

		// Write index.php guard.
		$index = $dir . 'index.php';
		if ( ! file_exists( $index ) ) {
			file_put_contents( $index, "<?php\n// Silence is golden.\n" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}

		// Backup existing bundles before writing new ones.
		foreach ( $bundles as $bundle ) {
			$bk_filename  = sanitize_file_name( $bundle['name'] );
			$bk_filepath  = $dir . $bk_filename;
			$bk_prev_path = $dir . pathinfo( $bk_filename, PATHINFO_FILENAME ) . '.prev.' . pathinfo( $bk_filename, PATHINFO_EXTENSION );
			if ( file_exists( $bk_filepath ) ) {
				copy( $bk_filepath, $bk_prev_path ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			}
		}

		// Store previous version hash for rollback.
		$current_version = get_option( 'yourtm_bundle_version', '' );
		if ( ! empty( $current_version ) ) {
			update_option( 'yourtm_prev_bundle_version', $current_version );
		}

		$total_size = 0;

		foreach ( $bundles as $bundle ) {
			$filename = sanitize_file_name( $bundle['name'] );
			$filepath = $dir . $filename;

			$written = file_put_contents( $filepath, $bundle['code'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

			if ( false === $written ) {
				return array(
					'success' => false,
					'message' => sprintf(
						/* translators: %s: filename */
						__( 'Failed to write bundle file: %s', 'yourtm-tag-manager' ),
						$filename
					),
				);
			}

			$total_size += (int) ( $bundle['size'] ?? strlen( $bundle['code'] ) );

			// Compute and store SRI hash for this bundle file.
			$sri_hash = base64_encode( hash( 'sha384', $bundle['code'], true ) );
			update_option( 'yourtm_bundle_sri_' . sanitize_file_name( $filename ), 'sha384-' . $sri_hash );
		}

		// Compute a version hash from all bundle hashes.
		$combined_hash = '';
		foreach ( $bundles as $bundle ) {
			$combined_hash .= $bundle['hash'] ?? '';
		}
		if ( empty( $version ) ) {
			$version = substr( hash( 'sha256', $combined_hash ), 0, 12 );
		}

		update_option( 'yourtm_bundle_version', sanitize_text_field( $version ) );
		update_option( 'yourtm_last_sync', current_time( 'mysql', true ) );
		update_option( 'yourtm_bundle_size', $total_size );

		// Purge caches so the new bundle is served immediately.
		$this->cache->purge_bundle_cache();

		return array(
			'success' => true,
			'message' => sprintf(
				/* translators: 1: version 2: human readable size */
				__( 'Bundle synced successfully. Version: %1$s (%2$s)', 'yourtm-tag-manager' ),
				$version,
				size_format( $total_size )
			),
			'version' => $version,
		);
	}

	/**
	 * Rollback to the previous bundle version.
	 *
	 * @return array{success: bool, message: string}
	 */
	public function rollback_bundle() {
		$container_id = get_option( 'yourtm_container_id', '' );
		if ( empty( $container_id ) ) {
			return array(
				'success' => false,
				'message' => __( 'No container ID configured.', 'yourtm-tag-manager' ),
			);
		}

		$dir          = YourTM_Tag_Manager::get_bundle_dir() . sanitize_file_name( $container_id ) . '/';
		$prev_version = get_option( 'yourtm_prev_bundle_version', '' );

		if ( empty( $prev_version ) ) {
			return array(
				'success' => false,
				'message' => __( 'No previous bundle version available for rollback.', 'yourtm-tag-manager' ),
			);
		}

		// Scan for all .prev. backup files in the bundle directory.
		$prev_files = glob( $dir . '*.prev.*' );

		if ( empty( $prev_files ) ) {
			return array(
				'success' => false,
				'message' => __( 'Previous bundle file not found on disk.', 'yourtm-tag-manager' ),
			);
		}

		// Restore each .prev. file by removing the .prev segment from its name.
		$total_size = 0;
		foreach ( $prev_files as $prev_file ) {
			$basename     = basename( $prev_file );
			$restored     = str_replace( '.prev.', '.', $basename );
			$current_file = $dir . $restored;

			if ( ! rename( $prev_file, $current_file ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions
				return array(
					'success' => false,
					'message' => sprintf(
						/* translators: %s: filename */
						__( 'Failed to restore previous bundle file: %s', 'yourtm-tag-manager' ),
						$basename
					),
				);
			}

			if ( file_exists( $current_file ) ) {
				$total_size += filesize( $current_file );
			}
		}

		// Restore the previous version option.
		update_option( 'yourtm_bundle_version', $prev_version );
		delete_option( 'yourtm_prev_bundle_version' );

		// Update bundle size from all restored files.
		update_option( 'yourtm_bundle_size', $total_size );

		// Purge caches.
		$this->cache->purge_bundle_cache();

		return array(
			'success' => true,
			'message' => sprintf(
				/* translators: %s: version */
				__( 'Bundle rolled back to version %s.', 'yourtm-tag-manager' ),
				$prev_version
			),
		);
	}

	// ------------------------------------------------------------------
	// Webhook receiver (desktop app pushes bundle on publish)
	// ------------------------------------------------------------------

	/**
	 * Handle an incoming bundle push from the desktop app.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function handle_webhook( $request ) {
		$container_id = sanitize_text_field( $request->get_param( 'container_id' ) );
		$bundles      = $request->get_param( 'bundles' );
		$version      = sanitize_text_field( $request->get_param( 'version' ) );

		if ( empty( $container_id ) || empty( $bundles ) || ! is_array( $bundles ) ) {
			return new WP_Error(
				'yourtm_invalid_payload',
				__( 'Missing container_id or bundles in request body.', 'yourtm-tag-manager' ),
				array( 'status' => 400 )
			);
		}

		// Sanitize bundle data.
		$clean_bundles = array();
		foreach ( $bundles as $bundle ) {
			if ( empty( $bundle['name'] ) || empty( $bundle['code'] ) ) {
				continue;
			}
			$clean_bundles[] = array(
				'name' => sanitize_file_name( $bundle['name'] ),
				'code' => $bundle['code'], // Raw JS code, not HTML-sanitized.
				'hash' => sanitize_text_field( $bundle['hash'] ?? '' ),
				'size' => absint( $bundle['size'] ?? strlen( $bundle['code'] ) ),
			);
		}

		if ( empty( $clean_bundles ) ) {
			return new WP_Error(
				'yourtm_empty_bundles',
				__( 'No valid bundles in payload.', 'yourtm-tag-manager' ),
				array( 'status' => 400 )
			);
		}

		$result = $this->store_bundles( $container_id, $clean_bundles, $version );

		if ( $result['success'] ) {
			return new WP_REST_Response( $result, 200 );
		}

		return new WP_Error( 'yourtm_store_failed', $result['message'], array( 'status' => 500 ) );
	}

	// ------------------------------------------------------------------
	// Enqueue on frontend
	// ------------------------------------------------------------------

	/**
	 * Enqueue the tag bundle on the public-facing site.
	 */
	public function enqueue_bundle() {
		// Bail early if conditions dictate we should not load.
		if ( $this->should_skip_loading() ) {
			return;
		}

		/** Allow third-party code to prevent bundle loading. */
		if ( ! apply_filters( 'yourtm_should_load_bundle', true ) ) {
			return;
		}

		$bundle_url = $this->get_bundle_url();
		if ( empty( $bundle_url ) ) {
			return;
		}

		/** Allow filtering the bundle URL. */
		$bundle_url = apply_filters( 'yourtm_bundle_url', $bundle_url );

		$version   = get_option( 'yourtm_bundle_version', YOURTM_VERSION );
		$position  = get_option( 'yourtm_script_position', 'head' );
		$loading    = $this->get_effective_loading_strategy();
		$in_footer  = ( 'footer' === $position );
		$zone_files = $this->get_local_zone_files();

		// Use WP 6.3+ script strategy parameter when available.
		if ( version_compare( get_bloginfo( 'version' ), '6.3', '>=' ) && 'blocking' !== $loading ) {
			wp_register_script(
				self::SCRIPT_HANDLE,
				$bundle_url,
				array(),
				$version,
				array(
					'in_footer' => $in_footer,
					'strategy'  => $loading, // 'async' or 'defer'.
				)
			);
			wp_enqueue_script( self::SCRIPT_HANDLE );
		} else {
			wp_enqueue_script(
				self::SCRIPT_HANDLE,
				$bundle_url,
				array(),
				$version,
				$in_footer
			);
		}

		// Use wp_add_inline_script instead of wp_localize_script for proper JSON output.
		$container_id = get_option( 'yourtm_container_id', '' );
		if ( ! empty( $container_id ) ) {
			$config = array(
				'containerId' => sanitize_text_field( $container_id ),
				'environment' => sanitize_text_field( get_option( 'yourtm_environment', 'production' ) ),
			);
			wp_add_inline_script(
				self::SCRIPT_HANDLE,
				'window._ytm_config = ' . wp_json_encode( $config ) . ';',
				'before'
			);
		}

		// Enqueue zone files (they depend on core and register tags via window.YourTM.registerTag).
		foreach ( $zone_files as $zone ) {
			$handle = 'yourtm-' . sanitize_title( basename( $zone['name'], '.js' ) );
			if ( version_compare( get_bloginfo( 'version' ), '6.3', '>=' ) && 'blocking' !== $loading ) {
				wp_register_script(
					$handle,
					$zone['url'],
					array( self::SCRIPT_HANDLE ), // Depends on core.
					$version,
					array(
						'in_footer' => $in_footer,
						'strategy'  => $loading,
					)
				);
				wp_enqueue_script( $handle );
			} else {
				wp_enqueue_script(
					$handle,
					$zone['url'],
					array( self::SCRIPT_HANDLE ),
					$version,
					$in_footer
				);
			}
		}
	}

	/**
	 * Resolve the loading strategy actually used for the bundle scripts.
	 *
	 * Zone bundles call window.YourTM.registerTag(), so they must execute AFTER
	 * core. 'async' gives no ordering guarantee — the zone script can run first
	 * and throw "Cannot read properties of undefined (reading 'registerTag')",
	 * leaving every tag unregistered. When zone files are present we therefore
	 * coerce async to defer, which preserves document order without blocking
	 * the parser. With no zone files there is nothing to order, so async stands.
	 *
	 * Single source of truth: both wp_enqueue_script() and the legacy
	 * script_loader_tag filter must agree, or the tag gets the wrong attribute.
	 *
	 * @return string 'async' | 'defer' | 'blocking'
	 */
	private function get_effective_loading_strategy() {
		$loading = get_option( 'yourtm_script_loading', 'defer' );

		if ( 'async' === $loading && ! empty( $this->get_local_zone_files() ) ) {
			return 'defer';
		}

		return $loading;
	}

	/**
	 * Filter script tag to add async/defer attributes.
	 *
	 * @param string $tag    Script HTML tag.
	 * @param string $handle Script handle.
	 * @param string $src    Script source URL.
	 * @return string
	 */
	public function add_script_attributes( $tag, $handle, $src ) {
		if ( self::SCRIPT_HANDLE !== $handle ) {
			return $tag;
		}

		$loading = $this->get_effective_loading_strategy();

		// Only add attributes if not already present (WP 6.3+ may have added them).
		if ( 'async' === $loading && false === strpos( $tag, ' async' ) ) {
			$tag = str_replace( ' src=', ' async src=', $tag );
		} elseif ( 'defer' === $loading && false === strpos( $tag, ' defer' ) ) {
			$tag = str_replace( ' src=', ' defer src=', $tag );
		}

		// Add data-yourtm-container attribute.
		$container_id = esc_attr( get_option( 'yourtm_container_id', '' ) );
		if ( ! empty( $container_id ) ) {
			$tag = str_replace( ' src=', ' data-yourtm-container="' . $container_id . '" src=', $tag );
		}

		// Add SRI integrity attribute only when serving from the local bundle.
		// When falling back to CDN, the hash was computed from the local file
		// and may not match the CDN content, which would cause the browser to block the script.
		$local_path = $this->get_local_bundle_path();
		if ( ! empty( $local_path ) && file_exists( $local_path ) ) {
			$sri_hash = get_option( 'yourtm_bundle_sri_core.js', get_option( 'yourtm_bundle_sri_bundle.js', '' ) );
			if ( ! empty( $sri_hash ) ) {
				$tag = str_replace( ' src=', ' integrity="' . esc_attr( $sri_hash ) . '" crossorigin="anonymous" src=', $tag );
			}
		}

		return $tag;
	}

	// ------------------------------------------------------------------
	// Resource preload hint
	// ------------------------------------------------------------------

	/**
	 * Output a preload hint for the bundle script in wp_head.
	 */
	public function output_preload_hint() {
		if ( $this->should_skip_loading() ) {
			return;
		}

		if ( ! apply_filters( 'yourtm_should_load_bundle', true ) ) {
			return;
		}

		$bundle_url = $this->get_bundle_url();
		if ( empty( $bundle_url ) ) {
			return;
		}

		$bundle_url = apply_filters( 'yourtm_bundle_url', $bundle_url );
		$version    = get_option( 'yourtm_bundle_version', YOURTM_VERSION );

		// Append version query string for cache busting.
		$preload_url = add_query_arg( 'ver', $version, $bundle_url );

		// Include SRI attributes on the preload hint only when serving from the local bundle,
		// so the browser can reuse the preloaded resource for the <script> tag (which also has SRI).
		$sri_attrs  = '';
		$local_path = $this->get_local_bundle_path();
		if ( ! empty( $local_path ) && file_exists( $local_path ) ) {
			$sri_hash = get_option( 'yourtm_bundle_sri_core.js', get_option( 'yourtm_bundle_sri_bundle.js', '' ) );
			if ( ! empty( $sri_hash ) ) {
				$sri_attrs = ' integrity="' . esc_attr( $sri_hash ) . '" crossorigin="anonymous"';
			}
		}

		echo '<link rel="preload" href="' . esc_url( $preload_url ) . '" as="script"' . $sri_attrs . '>' . "\n";
	}

	// ------------------------------------------------------------------
	// URL resolution
	// ------------------------------------------------------------------

	/**
	 * Get the URL to serve for the bundle, preferring local.
	 *
	 * @return string Bundle URL or empty string if nothing available.
	 */
	public function get_bundle_url() {
		$local = $this->get_local_bundle_path();
		if ( ! empty( $local ) && file_exists( $local ) ) {
			return $this->get_local_bundle_url();
		}

		return $this->get_bundle_source_url();
	}

	/**
	 * Absolute filesystem path to the main bundle file.
	 *
	 * @return string
	 */
	public function get_local_bundle_path() {
		$container_id = get_option( 'yourtm_container_id', '' );
		if ( empty( $container_id ) ) {
			return '';
		}
		$dir = YourTM_Tag_Manager::get_bundle_dir() . sanitize_file_name( $container_id ) . '/';
		// Check for core.js first, fall back to bundle.js for backwards compat.
		if ( file_exists( $dir . 'core.js' ) ) {
			return $dir . 'core.js';
		}
		return $dir . 'bundle.js';
	}

	/**
	 * Public URL of the locally stored bundle.
	 *
	 * @return string
	 */
	public function get_local_bundle_url() {
		$container_id = get_option( 'yourtm_container_id', '' );
		if ( empty( $container_id ) ) {
			return '';
		}
		$dir  = YourTM_Tag_Manager::get_bundle_dir() . sanitize_file_name( $container_id ) . '/';
		$base = YourTM_Tag_Manager::get_bundle_url() . sanitize_file_name( $container_id ) . '/';
		if ( file_exists( $dir . 'core.js' ) ) {
			return $base . 'core.js';
		}
		return $base . 'bundle.js';
	}

	/**
	 * Get locally stored zone files and their URLs.
	 *
	 * @return array Array of [ 'name' => string, 'url' => string ]
	 */
	public function get_local_zone_files() {
		$container_id = get_option( 'yourtm_container_id', '' );
		if ( empty( $container_id ) ) {
			return array();
		}
		$dir   = YourTM_Tag_Manager::get_bundle_dir() . sanitize_file_name( $container_id ) . '/';
		$base  = YourTM_Tag_Manager::get_bundle_url() . sanitize_file_name( $container_id ) . '/';
		$zones = array();

		if ( ! is_dir( $dir ) ) {
			return $zones;
		}

		foreach ( glob( $dir . 'zone-*.js' ) as $file ) {
			$filename = basename( $file );
			$zones[]  = array(
				'name' => $filename,
				'url'  => $base . $filename,
			);
		}
		return $zones;
	}

	/**
	 * CDN fallback URL configured in settings.
	 *
	 * @return string
	 */
	public function get_bundle_source_url() {
		$bundle_url  = get_option( 'yourtm_bundle_url', '' );
		if ( empty( $bundle_url ) ) {
			return '';
		}
		$environment = get_option( 'yourtm_environment', 'production' );
		return trailingslashit( $bundle_url ) . $environment . '/core.js';
	}

	// ------------------------------------------------------------------
	// Helpers
	// ------------------------------------------------------------------

	/**
	 * Determine whether bundle loading should be skipped for the current request.
	 *
	 * @return bool
	 */
	private function should_skip_loading() {
		// No container configured.
		if ( empty( get_option( 'yourtm_container_id', '' ) ) ) {
			return true;
		}

		// Admin users excluded.
		if ( get_option( 'yourtm_disable_for_admins', '0' ) === '1' && current_user_can( 'manage_options' ) ) {
			return true;
		}

		// WordPress preview pages.
		if ( get_option( 'yourtm_disable_on_preview', '1' ) === '1' && is_preview() ) {
			return true;
		}

		// Don't load in the customizer preview.
		if ( is_customize_preview() ) {
			return true;
		}

		return false;
	}

	/**
	 * Get info about the currently stored bundle.
	 *
	 * @return array{exists: bool, version: string, size: int, last_sync: string, path: string}
	 */
	public function get_bundle_info() {
		$path = $this->get_local_bundle_path();
		return array(
			'exists'    => ! empty( $path ) && file_exists( $path ),
			'version'   => get_option( 'yourtm_bundle_version', '' ),
			'size'      => (int) get_option( 'yourtm_bundle_size', 0 ),
			'last_sync' => get_option( 'yourtm_last_sync', '' ),
			'path'      => $path,
			'url'       => $this->get_bundle_url(),
		);
	}
}
