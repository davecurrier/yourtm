<?php
/**
 * Cache manager: purge caches across hosting environments after bundle sync.
 *
 * @package YourTM_Tag_Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class YourTM_Cache {

	/**
	 * Purge all relevant caches after a bundle update.
	 *
	 * @return array List of caches that were purged.
	 */
	public function purge_bundle_cache() {
		$purged = array();

		// WordPress object cache.
		wp_cache_delete( 'yourtm_bundle_version', 'yourtm' );
		$purged[] = 'object_cache';

		// WP Engine.
		if ( class_exists( 'WpeCommon' ) ) {
			if ( method_exists( 'WpeCommon', 'purge_varnish_cache' ) ) {
				WpeCommon::purge_varnish_cache(); // phpcs:ignore
			}
			if ( method_exists( 'WpeCommon', 'purge_memcached' ) ) {
				WpeCommon::purge_memcached(); // phpcs:ignore
			}
			$purged[] = 'wpengine';
		}

		// WP Super Cache.
		if ( function_exists( 'wp_cache_clear_cache' ) ) {
			wp_cache_clear_cache();
			$purged[] = 'wp_super_cache';
		}

		// W3 Total Cache.
		if ( function_exists( 'w3tc_flush_all' ) ) {
			w3tc_flush_all();
			$purged[] = 'w3_total_cache';
		}

		// LiteSpeed Cache.
		if ( class_exists( 'LiteSpeed_Cache_API' ) && method_exists( 'LiteSpeed_Cache_API', 'purge_all' ) ) {
			LiteSpeed_Cache_API::purge_all(); // phpcs:ignore
			$purged[] = 'litespeed';
		}

		// WP Fastest Cache.
		if ( function_exists( 'wpfc_clear_all_cache' ) ) {
			wpfc_clear_all_cache( true );
			$purged[] = 'wp_fastest_cache';
		}

		// Autoptimize.
		if ( class_exists( 'autoptimizeCache' ) && method_exists( 'autoptimizeCache', 'clearall' ) ) {
			autoptimizeCache::clearall(); // phpcs:ignore
			$purged[] = 'autoptimize';
		}

		// SG Optimizer (SiteGround).
		if ( function_exists( 'sg_cachepress_purge_cache' ) ) {
			sg_cachepress_purge_cache();
			$purged[] = 'siteground';
		}

		// Kinsta.
		if ( class_exists( 'Kinsta\Cache' ) && isset( $GLOBALS['kinsta_cache'] ) ) {
			if ( method_exists( $GLOBALS['kinsta_cache'], 'kinsta_cache_purge' ) ) {
				$GLOBALS['kinsta_cache']->kinsta_cache_purge( '/' );
				$purged[] = 'kinsta';
			}
		}

		// Cloudflare (official plugin).
		if ( class_exists( 'CF\WordPress\Hooks' ) ) {
			// The Cloudflare plugin listens for cache purge actions.
			// Trigger a targeted purge by URL if possible.
			$bundle_url = $this->get_bundle_public_url();
			if ( ! empty( $bundle_url ) ) {
				/**
				 * Allow Cloudflare plugin integrations to purge specific URLs.
				 *
				 * @param array $urls URLs to purge.
				 */
				do_action( 'cloudflare_purge_by_url', array( $bundle_url ) );
			}
			$purged[] = 'cloudflare';
		}

		// Breeze (Cloudways).
		if ( class_exists( 'Breeze_PurgeCache' ) && method_exists( 'Breeze_PurgeCache', 'breeze_cache_flush' ) ) {
			Breeze_PurgeCache::breeze_cache_flush();
			$purged[] = 'breeze';
		}

		// Hummingbird.
		if ( class_exists( 'Hummingbird\\WP_Hummingbird' ) ) {
			do_action( 'wphb_clear_page_cache' );
			$purged[] = 'hummingbird';
		}

		// External Object Cache (Redis/Memcached) - targeted deletion only.
		if ( wp_using_ext_object_cache() ) {
			wp_cache_delete( 'yourtm_bundle_version', 'yourtm' );
			wp_cache_delete( 'yourtm_bundle_size', 'yourtm' );
			wp_cache_delete( 'yourtm_last_sync', 'yourtm' );
			$purged[] = 'external_object_cache';
		}

		/**
		 * Allow third-party cache plugins to hook in.
		 *
		 * @param array $purged List of caches already purged.
		 */
		do_action( 'yourtm_after_cache_purge', $purged );

		return $purged;
	}

	/**
	 * Get the public URL for the current bundle (used for targeted CDN purge).
	 *
	 * @return string
	 */
	private function get_bundle_public_url() {
		$container_id = get_option( 'yourtm_container_id', '' );
		if ( empty( $container_id ) ) {
			return '';
		}
		return YourTM_Tag_Manager::get_bundle_url() . sanitize_file_name( $container_id ) . '/bundle.js';
	}

	/**
	 * Get cache headers array for bundle files.
	 * These would be applied if serving bundles through a custom rewrite rule.
	 *
	 * @return array
	 */
	public function get_bundle_cache_headers() {
		return array(
			'Cache-Control' => 'public, max-age=31536000, immutable',
			'X-Content-Type-Options' => 'nosniff',
			'Content-Type'  => 'application/javascript; charset=UTF-8',
		);
	}

	/**
	 * Return a human-readable list of detected cache systems.
	 *
	 * @return array
	 */
	public function get_detected_caches() {
		$detected = array();

		if ( class_exists( 'WpeCommon' ) ) {
			$detected[] = 'WP Engine';
		}
		if ( function_exists( 'wp_cache_clear_cache' ) ) {
			$detected[] = 'WP Super Cache';
		}
		if ( function_exists( 'w3tc_flush_all' ) ) {
			$detected[] = 'W3 Total Cache';
		}
		if ( class_exists( 'LiteSpeed_Cache_API' ) ) {
			$detected[] = 'LiteSpeed Cache';
		}
		if ( function_exists( 'wpfc_clear_all_cache' ) ) {
			$detected[] = 'WP Fastest Cache';
		}
		if ( class_exists( 'autoptimizeCache' ) ) {
			$detected[] = 'Autoptimize';
		}
		if ( function_exists( 'sg_cachepress_purge_cache' ) ) {
			$detected[] = 'SG Optimizer (SiteGround)';
		}
		if ( class_exists( 'Kinsta\Cache' ) ) {
			$detected[] = 'Kinsta';
		}
		if ( class_exists( 'CF\WordPress\Hooks' ) ) {
			$detected[] = 'Cloudflare';
		}
		if ( class_exists( 'Breeze_PurgeCache' ) ) {
			$detected[] = 'Breeze (Cloudways)';
		}
		if ( wp_using_ext_object_cache() ) {
			$detected[] = 'External Object Cache (Redis/Memcached)';
		}

		if ( empty( $detected ) ) {
			$detected[] = 'None detected (WordPress default)';
		}

		return $detected;
	}
}
