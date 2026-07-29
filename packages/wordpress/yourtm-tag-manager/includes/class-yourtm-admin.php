<?php
/**
 * Admin settings page and AJAX handlers.
 *
 * @package YourTM_Tag_Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class YourTM_Admin {

	/**
	 * @var YourTM_Bundle
	 */
	private $bundle;

	/**
	 * @var YourTM_Zones
	 */
	private $zones;

	/**
	 * Constructor.
	 *
	 * @param YourTM_Bundle $bundle Bundle manager.
	 * @param YourTM_Zones  $zones  Zone mapper.
	 */
	public function __construct( YourTM_Bundle $bundle, YourTM_Zones $zones ) {
		$this->bundle = $bundle;
		$this->zones  = $zones;
	}

	// ------------------------------------------------------------------
	// Menu & Settings Registration
	// ------------------------------------------------------------------

	/**
	 * Add the settings page under Settings menu.
	 */
	public function add_menu_page() {
		add_options_page(
			__( 'YourTM Tag Manager', 'yourtm-tag-manager' ),
			__( 'YourTM Tag Manager', 'yourtm-tag-manager' ),
			'manage_options',
			'yourtm-tag-manager',
			array( $this, 'render_settings_page' )
		);
	}

	/**
	 * Register settings with the Settings API.
	 */
	public function register_settings() {
		// Connection settings.
		register_setting( 'yourtm_settings', 'yourtm_container_id', array(
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_text_field',
			'default'           => '',
		) );
		register_setting( 'yourtm_settings', 'yourtm_api_key', array(
			'type'              => 'string',
			'sanitize_callback' => array( $this, 'sanitize_api_key' ),
			'default'           => '',
		) );
		register_setting( 'yourtm_settings', 'yourtm_bundle_url', array(
			'type'              => 'string',
			'sanitize_callback' => 'esc_url_raw',
			'default'           => '',
		) );

		// Bundle settings.
		register_setting( 'yourtm_settings', 'yourtm_auto_sync', array(
			'type'              => 'string',
			'sanitize_callback' => array( $this, 'sanitize_checkbox' ),
			'default'           => '0',
		) );
		register_setting( 'yourtm_settings', 'yourtm_sync_interval', array(
			'type'              => 'string',
			'sanitize_callback' => array( $this, 'sanitize_sync_interval' ),
			'default'           => 'twicedaily',
		) );

		// Output settings.
		register_setting( 'yourtm_settings', 'yourtm_script_position', array(
			'type'              => 'string',
			'sanitize_callback' => array( $this, 'sanitize_script_position' ),
			'default'           => 'head',
		) );
		register_setting( 'yourtm_settings', 'yourtm_script_loading', array(
			'type'              => 'string',
			'sanitize_callback' => array( $this, 'sanitize_script_loading' ),
			'default'           => 'defer',
		) );
		register_setting( 'yourtm_settings', 'yourtm_disable_for_admins', array(
			'type'              => 'string',
			'sanitize_callback' => array( $this, 'sanitize_checkbox' ),
			'default'           => '0',
		) );
		register_setting( 'yourtm_settings', 'yourtm_disable_on_preview', array(
			'type'              => 'string',
			'sanitize_callback' => array( $this, 'sanitize_checkbox' ),
			'default'           => '1',
		) );

		// DataLayer settings.
		register_setting( 'yourtm_settings', 'yourtm_datalayer_enabled', array(
			'type'              => 'string',
			'sanitize_callback' => array( $this, 'sanitize_checkbox' ),
			'default'           => '0',
		) );
		register_setting( 'yourtm_settings', 'yourtm_datalayer_fields', array(
			'type'              => 'array',
			'sanitize_callback' => array( $this, 'sanitize_datalayer_fields' ),
			'default'           => array( 'page', 'site', 'user' ),
		) );

		// Advanced settings.
		register_setting( 'yourtm_settings', 'yourtm_environment', array(
			'type'              => 'string',
			'sanitize_callback' => array( $this, 'sanitize_environment' ),
			'default'           => 'production',
		) );
		// Handle cron schedule changes.
		add_action( 'update_option_yourtm_auto_sync', array( $this, 'handle_auto_sync_change' ), 10, 2 );
		add_action( 'update_option_yourtm_sync_interval', array( $this, 'handle_sync_interval_change' ), 10, 2 );
	}

	// ------------------------------------------------------------------
	// Sanitization callbacks
	// ------------------------------------------------------------------

	/**
	 * Sanitize API key value.
	 *
	 * If the submitted value is the masked version (contains asterisks),
	 * keep the existing stored key instead of overwriting it.
	 *
	 * @param string $value Input value.
	 * @return string
	 */
	public function sanitize_api_key( $value ) {
		$value = sanitize_text_field( $value );

		// If the value is empty, keep the existing key.
		if ( empty( $value ) ) {
			return get_option( 'yourtm_api_key', '' );
		}

		// If the value contains asterisks, it's the masked version — keep the existing key.
		if ( strpos( $value, '*' ) !== false ) {
			return get_option( 'yourtm_api_key', '' );
		}

		return $value;
	}

	/**
	 * Sanitize a checkbox value to '0' or '1'.
	 *
	 * @param mixed $value Input value.
	 * @return string
	 */
	public function sanitize_checkbox( $value ) {
		return ( '1' === $value || 1 === $value || true === $value ) ? '1' : '0';
	}

	/**
	 * Sanitize sync interval.
	 *
	 * @param string $value Input value.
	 * @return string
	 */
	public function sanitize_sync_interval( $value ) {
		$allowed = array( 'hourly', 'twicedaily', 'daily' );
		return in_array( $value, $allowed, true ) ? $value : 'twicedaily';
	}

	/**
	 * Sanitize script position.
	 *
	 * @param string $value Input value.
	 * @return string
	 */
	public function sanitize_script_position( $value ) {
		return in_array( $value, array( 'head', 'footer' ), true ) ? $value : 'head';
	}

	/**
	 * Sanitize script loading strategy.
	 *
	 * @param string $value Input value.
	 * @return string
	 */
	public function sanitize_script_loading( $value ) {
		return in_array( $value, array( 'async', 'defer', 'blocking' ), true ) ? $value : 'defer';
	}

	/**
	 * Sanitize environment.
	 *
	 * @param string $value Input value.
	 * @return string
	 */
	public function sanitize_environment( $value ) {
		return in_array( $value, array( 'production', 'staging', 'development' ), true ) ? $value : 'production';
	}

	/**
	 * Sanitize datalayer fields array.
	 *
	 * @param mixed $value Input value.
	 * @return array
	 */
	public function sanitize_datalayer_fields( $value ) {
		// options.php posts null when every box in the group is unchecked. That
		// is a deliberate "none", not missing data, so it must not fall through
		// to the defaults or the choice silently reverts on save.
		if ( null === $value ) {
			return array();
		}
		if ( ! is_array( $value ) ) {
			return array( 'page', 'site', 'user' );
		}
		$allowed = array( 'page', 'site', 'user', 'ecommerce' );
		return array_values( array_intersect( $value, $allowed ) );
	}

	// ------------------------------------------------------------------
	// URL helpers
	// ------------------------------------------------------------------

	/**
	 * Check if a URL points to a localhost address.
	 *
	 * @param string $url URL to check.
	 * @return bool
	 */
	public static function is_localhost_url( $url ) {
		$host = wp_parse_url( $url, PHP_URL_HOST );
		if ( empty( $host ) ) {
			return false;
		}
		$localhost_hosts = array( 'localhost', '127.0.0.1', '::1' );
		return in_array( strtolower( $host ), $localhost_hosts, true );
	}

	// ------------------------------------------------------------------
	// Cron schedule management
	// ------------------------------------------------------------------

	/**
	 * Handle changes to the auto-sync toggle.
	 *
	 * @param string $old_value Old value.
	 * @param string $new_value New value.
	 */
	public function handle_auto_sync_change( $old_value, $new_value ) {
		if ( '1' === $new_value ) {
			$interval = get_option( 'yourtm_sync_interval', 'twicedaily' );
			if ( ! wp_next_scheduled( 'yourtm_auto_sync_event' ) ) {
				wp_schedule_event( time(), $interval, 'yourtm_auto_sync_event' );
			}
		} else {
			wp_clear_scheduled_hook( 'yourtm_auto_sync_event' );
		}
	}

	/**
	 * Handle changes to the sync interval.
	 *
	 * @param string $old_value Old value.
	 * @param string $new_value New value.
	 */
	public function handle_sync_interval_change( $old_value, $new_value ) {
		if ( get_option( 'yourtm_auto_sync' ) === '1' ) {
			wp_clear_scheduled_hook( 'yourtm_auto_sync_event' );
			wp_schedule_event( time(), $new_value, 'yourtm_auto_sync_event' );
		}
	}

	// ------------------------------------------------------------------
	// Admin Assets
	// ------------------------------------------------------------------

	/**
	 * Enqueue admin CSS and JS on the settings page only.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public function enqueue_admin_assets( $hook ) {
		if ( 'settings_page_yourtm-tag-manager' !== $hook ) {
			return;
		}

		wp_enqueue_style(
			'yourtm-admin',
			YOURTM_PLUGIN_URL . 'admin/css/admin.css',
			array(),
			YOURTM_VERSION
		);

		wp_enqueue_script(
			'yourtm-admin',
			YOURTM_PLUGIN_URL . 'admin/js/admin.js',
			array(),
			YOURTM_VERSION,
			true
		);

		wp_localize_script(
			'yourtm-admin',
			'yourtmAdmin',
			array(
				'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
				'nonce'     => wp_create_nonce( 'yourtm_admin_nonce' ),
				'restUrl'   => rest_url( 'yourtm/v1/' ),
				'restNonce' => wp_create_nonce( 'wp_rest' ),
				'strings'   => array(
					'syncing'          => __( 'Syncing...', 'yourtm-tag-manager' ),
					'syncSuccess'      => __( 'Bundle synced successfully!', 'yourtm-tag-manager' ),
					'syncFailed'       => __( 'Sync failed: ', 'yourtm-tag-manager' ),
					'testing'          => __( 'Testing connection...', 'yourtm-tag-manager' ),
					'connected'        => __( 'Connected', 'yourtm-tag-manager' ),
					'disconnected'     => __( 'Disconnected', 'yourtm-tag-manager' ),
					'connectionFailed' => __( 'Connection failed: ', 'yourtm-tag-manager' ),
				),
			)
		);
	}

	// ------------------------------------------------------------------
	// AJAX Handlers
	// ------------------------------------------------------------------

	/**
	 * AJAX: Sync bundle from desktop app.
	 */
	public function ajax_sync_bundle() {
		check_ajax_referer( 'yourtm_admin_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Unauthorized.', 'yourtm-tag-manager' ) ) );
		}

		$result = $this->bundle->sync_bundle();
		if ( $result['success'] ) {
			wp_send_json_success( $result );
		} else {
			wp_send_json_error( $result );
		}
	}

	/**
	 * AJAX: Check plugin configuration status.
	 *
	 * Checks that the plugin is properly configured and has a valid bundle.
	 * Does NOT try to reach the desktop app (which is a local dev tool, not a server).
	 */
	public function ajax_test_connection() {
		check_ajax_referer( 'yourtm_admin_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Unauthorized.', 'yourtm-tag-manager' ) ) );
		}

		$container_id    = get_option( 'yourtm_container_id', '' );
		$bundle_url      = get_option( 'yourtm_bundle_url', '' );
		$bundle_version  = get_option( 'yourtm_bundle_version', '' );
		$last_sync       = get_option( 'yourtm_last_sync', '' );

		// Check required configuration.
		if ( empty( $container_id ) ) {
			wp_send_json_error( array( 'message' => __( 'Please configure Container ID first.', 'yourtm-tag-manager' ) ) );
		}

		if ( empty( $bundle_url ) ) {
			wp_send_json_error( array( 'message' => __( 'Please configure Bundle URL (your Cloudflare R2 public URL).', 'yourtm-tag-manager' ) ) );
		}

		// Check if we have a local bundle.
		$local_path = YourTM_Tag_Manager::get_bundle_dir() . $container_id . '/bundle.js';
		$has_bundle = file_exists( $local_path );

		if ( $has_bundle ) {
			wp_send_json_success(
				array(
					'message' => sprintf(
						/* translators: %s: bundle version */
						__( 'Ready. Bundle version: %s', 'yourtm-tag-manager' ),
						$bundle_version ?: 'unknown'
					),
					'data'    => array(
						'status'         => 'active',
						'has_bundle'     => true,
						'bundle_version' => $bundle_version,
						'last_sync'      => $last_sync,
					),
				)
			);
		} elseif ( ! empty( $bundle_url ) ) {
			wp_send_json_success(
				array(
					'message' => __( 'Bundle URL configured but no bundle synced yet. Click Sync Now.', 'yourtm-tag-manager' ),
					'data'    => array(
						'status'     => 'pending',
						'has_bundle' => false,
					),
				)
			);
		} else {
			wp_send_json_error(
				array(
					'message' => __( 'No bundle synced yet. Push a bundle from the YourTM desktop app or configure a CDN fallback URL.', 'yourtm-tag-manager' ),
				)
			);
		}
	}

	// ------------------------------------------------------------------
	// Admin Notices
	// ------------------------------------------------------------------

	/**
	 * Show admin warning if bundle sync has failed repeatedly.
	 */
	public function sync_failure_notice() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$fail_count = (int) get_option( 'yourtm_sync_fail_count', 0 );
		if ( $fail_count <= 3 ) {
			return;
		}

		$last_error = get_option( 'yourtm_last_sync_error', '' );
		$settings_url = admin_url( 'options-general.php?page=yourtm-tag-manager' );

		printf(
			'<div class="notice notice-warning is-dismissible"><p><strong>%s</strong> %s</p>%s<p><a href="%s">%s</a></p></div>',
			esc_html__( 'YourTM Tag Manager:', 'yourtm-tag-manager' ),
			sprintf(
				/* translators: %d: number of consecutive failures */
				esc_html__( 'Bundle sync has failed %d consecutive times.', 'yourtm-tag-manager' ),
				$fail_count
			),
			! empty( $last_error )
				? '<p>' . sprintf(
					/* translators: %s: error message */
					esc_html__( 'Last error: %s', 'yourtm-tag-manager' ),
					esc_html( $last_error )
				) . '</p>'
				: '',
			esc_url( $settings_url ),
			esc_html__( 'Go to YourTM settings', 'yourtm-tag-manager' )
		);
	}

	// ------------------------------------------------------------------
	// Render
	// ------------------------------------------------------------------

	/**
	 * Render the settings page.
	 */
	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		// Gather data for the template.
		$bundle_info     = $this->bundle->get_bundle_info();
		$cache_manager   = new YourTM_Cache();
		$detected_caches = $cache_manager->get_detected_caches();

		include YOURTM_PLUGIN_DIR . 'admin/views/settings-page.php';
	}
}
