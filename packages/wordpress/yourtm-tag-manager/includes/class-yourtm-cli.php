<?php
/**
 * WP-CLI commands for YourTM Tag Manager.
 *
 * @package YourTM_Tag_Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( defined( 'WP_CLI' ) && WP_CLI ) {

	class YourTM_CLI {

		/**
		 * Sync the tag bundle from the desktop app or CDN.
		 *
		 * ## EXAMPLES
		 *
		 *     wp yourtm sync
		 *
		 * @when after_wp_load
		 */
		public function sync( $args, $assoc_args ) {
			$plugin = YourTM_Tag_Manager::instance();
			$bundle = $plugin->bundle;

			WP_CLI::log( __( 'Starting bundle sync...', 'yourtm-tag-manager' ) );

			$result = $bundle->sync_bundle();

			if ( ! $result['success'] ) {
				WP_CLI::error( $result['message'] );
			}

			WP_CLI::success( $result['message'] );
		}

		/**
		 * Show current bundle status.
		 *
		 * ## EXAMPLES
		 *
		 *     wp yourtm status
		 *
		 * @when after_wp_load
		 */
		public function status( $args, $assoc_args ) {
			$plugin = YourTM_Tag_Manager::instance();
			$info   = $plugin->bundle->get_bundle_info();

			$container_id = get_option( 'yourtm_container_id', '' );
			$environment  = get_option( 'yourtm_environment', 'production' );
			$auto_sync    = get_option( 'yourtm_auto_sync', '0' );
			$fail_count   = (int) get_option( 'yourtm_sync_fail_count', 0 );

			$data = array(
				array( 'Field' => 'Container ID',   'Value' => $container_id ?: '(not configured)' ),
				array( 'Field' => 'Environment',     'Value' => $environment ),
				array( 'Field' => 'Bundle Exists',   'Value' => $info['exists'] ? 'Yes' : 'No' ),
				array( 'Field' => 'Bundle Version',  'Value' => $info['version'] ?: '(none)' ),
				array( 'Field' => 'Bundle Size',     'Value' => $info['size'] ? size_format( $info['size'] ) : '(none)' ),
				array( 'Field' => 'Last Sync',       'Value' => $info['last_sync'] ?: '(never)' ),
				array( 'Field' => 'Bundle Path',     'Value' => $info['path'] ?: '(none)' ),
				array( 'Field' => 'Bundle URL',      'Value' => $info['url'] ?: '(none)' ),
				array( 'Field' => 'Auto Sync',       'Value' => '1' === $auto_sync ? 'Enabled' : 'Disabled' ),
				array( 'Field' => 'Sync Failures',   'Value' => (string) $fail_count ),
			);

			WP_CLI\Utils\format_items( 'table', $data, array( 'Field', 'Value' ) );
		}

		/**
		 * Purge all YourTM caches.
		 *
		 * ## EXAMPLES
		 *
		 *     wp yourtm purge
		 *
		 * @when after_wp_load
		 */
		public function purge( $args, $assoc_args ) {
			$cache  = new YourTM_Cache();
			$purged = $cache->purge_bundle_cache();

			WP_CLI::success(
				sprintf(
					/* translators: %s: comma-separated list of purged caches */
					__( 'Caches purged: %s', 'yourtm-tag-manager' ),
					implode( ', ', $purged )
				)
			);
		}

		/**
		 * Generate zone suggestions from WordPress structure.
		 *
		 * ## EXAMPLES
		 *
		 *     wp yourtm zones
		 *
		 * @when after_wp_load
		 */
		public function zones( $args, $assoc_args ) {
			$zones       = new YourTM_Zones();
			$suggestions = $zones->get_suggested_zones();

			// Flatten patterns array for table display.
			$table_data = array();
			foreach ( $suggestions as $zone ) {
				$table_data[] = array(
					'name'        => $zone['name'],
					'patterns'    => implode( ', ', $zone['patterns'] ),
					'type'        => $zone['type'],
					'description' => $zone['description'] ?? '',
				);
			}

			WP_CLI\Utils\format_items( 'table', $table_data, array( 'name', 'patterns', 'type', 'description' ) );
		}

		/**
		 * Rollback to the previous bundle version.
		 *
		 * ## EXAMPLES
		 *
		 *     wp yourtm rollback
		 *
		 * @when after_wp_load
		 */
		public function rollback( $args, $assoc_args ) {
			$plugin = YourTM_Tag_Manager::instance();
			$result = $plugin->bundle->rollback_bundle();

			if ( ! $result['success'] ) {
				WP_CLI::error( $result['message'] );
			}

			WP_CLI::success( $result['message'] );
		}
	}

	WP_CLI::add_command( 'yourtm', 'YourTM_CLI' );
}
