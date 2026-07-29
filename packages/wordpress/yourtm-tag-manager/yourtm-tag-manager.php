<?php
/**
 * Plugin Name: YourTM Tag Manager
 * Plugin URI:  https://yourtm.io/wordpress
 * Description: Connect your WordPress site to the YourTM desktop app and serve compiled tag manager bundles locally for zero-dependency, same-origin delivery.
 * Version:     1.0.0
 * Author:      YourTM
 * Author URI:  https://yourtm.io
 * License:     GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: yourtm-tag-manager
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Plugin constants.
if ( ! defined( 'YOURTM_VERSION' ) ) {
	define( 'YOURTM_VERSION', '1.0.0' );
}
if ( ! defined( 'YOURTM_PLUGIN_DIR' ) ) {
	define( 'YOURTM_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
}
if ( ! defined( 'YOURTM_PLUGIN_URL' ) ) {
	define( 'YOURTM_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
}
if ( ! defined( 'YOURTM_PLUGIN_BASENAME' ) ) {
	define( 'YOURTM_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );
}

// Autoload includes.
require_once YOURTM_PLUGIN_DIR . 'includes/class-yourtm-bundle.php';
require_once YOURTM_PLUGIN_DIR . 'includes/class-yourtm-api.php';
require_once YOURTM_PLUGIN_DIR . 'includes/class-yourtm-datalayer.php';
require_once YOURTM_PLUGIN_DIR . 'includes/class-yourtm-cache.php';
require_once YOURTM_PLUGIN_DIR . 'includes/class-yourtm-zones.php';
require_once YOURTM_PLUGIN_DIR . 'includes/class-yourtm-admin.php';

// WP-CLI commands.
if ( defined( 'WP_CLI' ) && WP_CLI ) {
	require_once YOURTM_PLUGIN_DIR . 'includes/class-yourtm-cli.php';
}

/**
 * Main plugin class.
 */
final class YourTM_Tag_Manager {

	/**
	 * Singleton instance.
	 *
	 * @var YourTM_Tag_Manager|null
	 */
	private static $instance = null;

	/**
	 * Cached upload directory info.
	 *
	 * @var array|null
	 */
	private static $upload_dir = null;

	/**
	 * Sub-component instances.
	 *
	 * @var YourTM_Bundle
	 */
	public $bundle;

	/**
	 * @var YourTM_API
	 */
	public $api;

	/**
	 * @var YourTM_DataLayer
	 */
	public $datalayer;

	/**
	 * @var YourTM_Cache
	 */
	public $cache;

	/**
	 * @var YourTM_Zones
	 */
	public $zones;

	/**
	 * @var YourTM_Admin
	 */
	public $admin;

	/**
	 * Get the bundle directory path, lazily computed and cached.
	 * On multisite, wp_upload_dir() returns per-site paths automatically.
	 *
	 * @return string
	 */
	public static function get_bundle_dir() {
		if ( null === self::$upload_dir ) {
			self::$upload_dir = wp_upload_dir();
		}
		return self::$upload_dir['basedir'] . '/yourtm-bundles/';
	}

	/**
	 * Get the bundle directory URL, lazily computed and cached.
	 * On multisite, wp_upload_dir() returns per-site URLs automatically.
	 *
	 * @return string
	 */
	public static function get_bundle_url() {
		if ( null === self::$upload_dir ) {
			self::$upload_dir = wp_upload_dir();
		}
		return self::$upload_dir['baseurl'] . '/yourtm-bundles/';
	}

	/**
	 * Get singleton instance.
	 *
	 * @return YourTM_Tag_Manager
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		load_plugin_textdomain( 'yourtm-tag-manager', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );

		$this->cache     = new YourTM_Cache();
		$this->bundle    = new YourTM_Bundle( $this->cache );
		$this->zones     = new YourTM_Zones();
		$this->api       = new YourTM_API( $this->bundle, $this->zones );
		$this->datalayer = new YourTM_DataLayer();
		$this->admin     = new YourTM_Admin( $this->bundle, $this->zones );

		$this->init_hooks();
	}

	/**
	 * Register WordPress hooks.
	 */
	private function init_hooks() {
		// Frontend: enqueue bundle and datalayer.
		add_action( 'wp_enqueue_scripts', array( $this->bundle, 'enqueue_bundle' ) );
		add_action( 'wp_head', array( $this->datalayer, 'output_datalayer' ), 1 );

		// WooCommerce AJAX add-to-cart tracking.
		add_action( 'wp_footer', array( $this->datalayer, 'output_add_to_cart_tracking' ) );

		// Async / defer attribute on the bundle script tag.
		add_filter( 'script_loader_tag', array( $this->bundle, 'add_script_attributes' ), 10, 3 );

		// REST API routes.
		add_action( 'rest_api_init', array( $this->api, 'register_routes' ) );

		// Admin.
		if ( is_admin() ) {
			add_action( 'admin_menu', array( $this->admin, 'add_menu_page' ) );
			add_action( 'admin_init', array( $this->admin, 'register_settings' ) );
			add_action( 'admin_enqueue_scripts', array( $this->admin, 'enqueue_admin_assets' ) );
			add_action( 'wp_ajax_yourtm_sync_bundle', array( $this->admin, 'ajax_sync_bundle' ) );
			add_action( 'wp_ajax_yourtm_test_connection', array( $this->admin, 'ajax_test_connection' ) );

			// Cron failure visibility.
			add_action( 'admin_notices', array( $this->admin, 'sync_failure_notice' ) );
		}

		// Plugin action links on the Plugins screen.
		add_filter( 'plugin_action_links_' . YOURTM_PLUGIN_BASENAME, array( $this, 'add_action_links' ) );

		// WP-Cron for auto-sync. Uses core's hourly/twicedaily/daily schedules —
		// see YourTM_Admin::sanitize_sync_interval() for the allowed values.
		add_action( 'yourtm_auto_sync_event', array( $this->bundle, 'sync_bundle' ) );
	}

	/**
	 * Add Settings link on Plugins page.
	 *
	 * @param array $links Existing links.
	 * @return array
	 */
	public function add_action_links( $links ) {
		$settings_link = sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'options-general.php?page=yourtm-tag-manager' ) ),
			esc_html__( 'Settings', 'yourtm-tag-manager' )
		);
		array_unshift( $links, $settings_link );
		return $links;
	}

	/**
	 * Plugin activation.
	 */
	public static function activate( $network_wide = false ) {
		if ( is_multisite() && $network_wide ) {
			$sites = get_sites( array( 'fields' => 'ids' ) );
			foreach ( $sites as $site_id ) {
				switch_to_blog( $site_id );
				self::$upload_dir = null; // Reset cached upload dir for the new blog context.
				self::activate_single_site();
				restore_current_blog();
			}
			self::$upload_dir = null; // Reset after loop so main site gets a fresh lookup.
		} else {
			self::activate_single_site();
		}
	}

	/**
	 * Activation logic for a single site.
	 */
	private static function activate_single_site() {
		$bundle_dir = self::get_bundle_dir();

		// Create bundle directory.
		if ( ! file_exists( $bundle_dir ) ) {
			wp_mkdir_p( $bundle_dir );
		}

		// Protect the directory with an index file.
		$index_file = $bundle_dir . 'index.php';
		if ( ! file_exists( $index_file ) ) {
			file_put_contents( $index_file, "<?php\n// Silence is golden.\n" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}

		// Set default options if they don't exist.
		$defaults = array(
			'yourtm_container_id'      => '',
			'yourtm_api_key'           => '',
			'yourtm_bundle_url'        => '',
			'yourtm_environment'       => 'production',
			'yourtm_bundle_version'    => '',
			'yourtm_last_sync'         => '',
			'yourtm_auto_sync'         => '0',
			'yourtm_sync_interval'     => 'twicedaily',
			// Off by default: enrichment emits its own nested dataLayer schema
			// (page/site/user/ecommerce). Turn it on only when your container's
			// variables actually read those keys, or it's unused page weight.
			'yourtm_datalayer_enabled' => '0',
			'yourtm_datalayer_fields'  => array( 'page', 'site', 'user' ),
			'yourtm_script_position'   => 'head',
			// 'defer' preserves core-then-zones execution order. See
			// YourTM_Bundle::get_effective_loading_strategy().
			'yourtm_script_loading'    => 'defer',
			'yourtm_disable_for_admins' => '0',
			'yourtm_disable_on_preview' => '1',
		);

		foreach ( $defaults as $key => $value ) {
			if ( false === get_option( $key ) ) {
				update_option( $key, $value );
			}
		}

		// Schedule cron if auto-sync is on.
		if ( get_option( 'yourtm_auto_sync' ) === '1' ) {
			$interval = get_option( 'yourtm_sync_interval', 'twicedaily' );
			if ( ! wp_next_scheduled( 'yourtm_auto_sync_event' ) ) {
				wp_schedule_event( time(), $interval, 'yourtm_auto_sync_event' );
			}
		}
	}

	/**
	 * Plugin deactivation.
	 */
	public static function deactivate() {
		wp_clear_scheduled_hook( 'yourtm_auto_sync_event' );
	}
}

// Activation / Deactivation hooks.
register_activation_hook( __FILE__, array( 'YourTM_Tag_Manager', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'YourTM_Tag_Manager', 'deactivate' ) );

/**
 * Boot the plugin on plugins_loaded.
 */
function yourtm_init() {
	return YourTM_Tag_Manager::instance();
}
add_action( 'plugins_loaded', 'yourtm_init' );
