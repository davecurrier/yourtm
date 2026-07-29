<?php
/**
 * REST API: expose WordPress site structure to the YourTM desktop app.
 *
 * @package YourTM_Tag_Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class YourTM_API {

	/**
	 * REST namespace.
	 *
	 * @var string
	 */
	const REST_NAMESPACE = 'yourtm/v1';

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
	// Route registration
	// ------------------------------------------------------------------

	/**
	 * Register all REST routes.
	 */
	public function register_routes() {
		register_rest_route(
			self::REST_NAMESPACE,
			'/site-info',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'get_site_info' ),
				'permission_callback' => array( $this, 'check_api_key' ),
			)
		);







		register_rest_route(
			self::REST_NAMESPACE,
			'/sync',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this->bundle, 'handle_webhook' ),
				'permission_callback' => array( $this, 'check_api_key' ),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/verify',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'verify_connection' ),
				'permission_callback' => array( $this, 'check_api_key' ),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/purge-cache',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'purge_cache' ),
				'permission_callback' => array( $this, 'check_api_key' ),
			)
		);
	}

	// ------------------------------------------------------------------
	// Authentication
	// ------------------------------------------------------------------

	/**
	 * Validate the API key from the request.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return bool|WP_Error
	 */
	public function check_api_key( $request ) {
		$stored_key = get_option( 'yourtm_api_key', '' );

		if ( empty( $stored_key ) ) {
			return new WP_Error(
				'yourtm_no_api_key',
				__( 'YourTM API key is not configured.', 'yourtm-tag-manager' ),
				array( 'status' => 403 )
			);
		}

		// Only accept the API key via the X-YourTM-Key header.
		$provided_key = $request->get_header( 'X-YourTM-Key' );

		if ( empty( $provided_key ) || ! hash_equals( $stored_key, $provided_key ) ) {
			return new WP_Error(
				'yourtm_invalid_api_key',
				__( 'Invalid API key.', 'yourtm-tag-manager' ),
				array( 'status' => 401 )
			);
		}

		return true;
	}

	// ------------------------------------------------------------------
	// Endpoint callbacks
	// ------------------------------------------------------------------

	/**
	 * GET /site-info - comprehensive site structure dump.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function get_site_info( $request ) {
		$data = array(
			'site_url'            => site_url(),
			'home_url'            => home_url(),
			'permalink_structure' => get_option( 'permalink_structure', '' ),
			'is_multisite'        => is_multisite(),
			'active_theme'        => get_stylesheet(),
			'post_types'          => $this->build_post_types_data(),
			'taxonomies'          => $this->build_taxonomies_data(),
			'page_templates'      => $this->build_templates_data(),
			'woocommerce'         => $this->build_woocommerce_data(),
			'suggested_zones'     => $this->zones->get_suggested_zones(),
			'plugin_info'         => $this->build_plugin_info(),
		);

		return new WP_REST_Response( $data, 200 );
	}







	/**
	 * POST /verify - health check.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function verify_connection( $request ) {
		$bundle_info = $this->bundle->get_bundle_info();

		return new WP_REST_Response(
			array(
				'status'       => 'ok',
				'site_url'     => site_url(),
				'plugin_ver'   => YOURTM_VERSION,
				'wp_ver'       => get_bloginfo( 'version' ),
				'php_ver'      => PHP_VERSION,
				'bundle_ready' => $bundle_info['exists'],
				'bundle_ver'   => $bundle_info['version'],
				'last_sync'    => $bundle_info['last_sync'],
				'timestamp'    => gmdate( 'c' ),
			),
			200
		);
	}

	/**
	 * POST /purge-cache - purge all YourTM-related caches.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function purge_cache( $request ) {
		$cache  = new YourTM_Cache();
		$purged = $cache->purge_bundle_cache();

		return new WP_REST_Response(
			array(
				'status'  => 'ok',
				'purged'  => $purged,
				'message' => __( 'Cache purged successfully.', 'yourtm-tag-manager' ),
			),
			200
		);
	}

	// ------------------------------------------------------------------
	// Data builders
	// ------------------------------------------------------------------

	/**
	 * Build the post types array.
	 *
	 * @return array
	 */
	private function build_post_types_data() {
		$post_types = get_post_types( array( 'public' => true ), 'objects' );
		$data       = array();

		foreach ( $post_types as $pt ) {
			$slug     = $pt->rewrite['slug'] ?? $pt->name;
			$count    = wp_count_posts( $pt->name );
			$pub      = isset( $count->publish ) ? (int) $count->publish : 0;

			$archive_url = '';
			if ( $pt->has_archive ) {
				$archive_slug = ( true === $pt->has_archive ) ? $slug : $pt->has_archive;
				$archive_url  = '/' . $archive_slug . '/';
			}

			$taxonomies = get_object_taxonomies( $pt->name );

			$data[] = array(
				'name'         => $pt->name,
				'label'        => $pt->label,
				'public'       => $pt->public,
				'has_archive'  => (bool) $pt->has_archive,
				'archive_url'  => $archive_url,
				'url_pattern'  => '/' . $slug . '/:slug/',
				'rewrite_slug' => $slug,
				'count'        => $pub,
				'taxonomies'   => $taxonomies,
			);
		}

		return $data;
	}

	/**
	 * Build the taxonomies array.
	 *
	 * @return array
	 */
	private function build_taxonomies_data() {
		$taxonomies = get_taxonomies( array( 'public' => true ), 'objects' );
		$data       = array();

		foreach ( $taxonomies as $tax ) {
			$slug        = $tax->rewrite['slug'] ?? $tax->name;
			$term_count  = wp_count_terms( array( 'taxonomy' => $tax->name, 'hide_empty' => false ) );
			$post_types  = array();

			foreach ( get_post_types( array( 'public' => true ) ) as $pt ) {
				if ( in_array( $tax->name, get_object_taxonomies( $pt ), true ) ) {
					$post_types[] = $pt;
				}
			}

			$data[] = array(
				'name'         => $tax->name,
				'label'        => $tax->label,
				'hierarchical' => $tax->hierarchical,
				'url_pattern'  => '/' . $slug . '/:slug/',
				'count'        => is_wp_error( $term_count ) ? 0 : (int) $term_count,
				'post_types'   => $post_types,
			);
		}

		return $data;
	}

	/**
	 * Build page templates data.
	 *
	 * @return array
	 */
	private function build_templates_data() {
		$templates = wp_get_theme()->get_page_templates();
		$data      = array();

		foreach ( $templates as $file => $name ) {
			// Count pages using this template.
			$query = new WP_Query(
				array(
					'post_type'      => 'page',
					'post_status'    => 'publish',
					'meta_key'       => '_wp_page_template',
					'meta_value'     => $file,
					'posts_per_page' => -1,
					'fields'         => 'ids',
					'no_found_rows'  => true,
				)
			);

			$data[] = array(
				'file'        => $file,
				'name'        => $name,
				'pages_using' => $query->post_count,
			);
		}

		return $data;
	}

	/**
	 * Build WooCommerce data if active.
	 *
	 * @return array|null
	 */
	private function build_woocommerce_data() {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return null;
		}

		$shop_id     = (int) get_option( 'woocommerce_shop_page_id', 0 );
		$cart_id     = (int) get_option( 'woocommerce_cart_page_id', 0 );
		$checkout_id = (int) get_option( 'woocommerce_checkout_page_id', 0 );
		$account_id  = (int) get_option( 'woocommerce_myaccount_page_id', 0 );

		return array(
			'active'        => true,
			'version'       => defined( 'WC_VERSION' ) ? WC_VERSION : '',
			'shop_page'     => $shop_id ? str_replace( home_url(), '', get_permalink( $shop_id ) ) : '/shop/',
			'cart_page'     => $cart_id ? str_replace( home_url(), '', get_permalink( $cart_id ) ) : '/cart/',
			'checkout_page' => $checkout_id ? str_replace( home_url(), '', get_permalink( $checkout_id ) ) : '/checkout/',
			'account_page'  => $account_id ? str_replace( home_url(), '', get_permalink( $account_id ) ) : '/my-account/',
			'currency'      => get_woocommerce_currency(),
		);
	}

	/**
	 * Build plugin info metadata.
	 *
	 * @return array
	 */
	private function build_plugin_info() {
		$info = array(
			'yourtm_version'    => YOURTM_VERSION,
			'wordpress_version' => get_bloginfo( 'version' ),
			'php_version'       => PHP_VERSION,
			'bundle_version'    => get_option( 'yourtm_bundle_version', '' ),
			'last_sync'         => get_option( 'yourtm_last_sync', '' ),
		);

		if ( class_exists( 'WooCommerce' ) && defined( 'WC_VERSION' ) ) {
			$info['woocommerce_version'] = WC_VERSION;
		}

		return $info;
	}
}
