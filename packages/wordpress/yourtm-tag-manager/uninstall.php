<?php
/**
 * Uninstall handler for YourTM Tag Manager.
 *
 * Fired when the plugin is deleted via the WordPress admin.
 * Removes all plugin options and bundle files.
 *
 * @package YourTM_Tag_Manager
 */

// Abort if not called by WordPress.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/**
 * Clean up options and bundle directory for the current site.
 */
function yourtm_uninstall_single_site() {
	global $wpdb;

	// Delete all options with the yourtm_ prefix.
	$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE 'yourtm\_%'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery

	// Remove the bundle directory recursively.
	$upload_dir = wp_upload_dir();
	$bundle_dir = $upload_dir['basedir'] . '/yourtm-bundles/';

	if ( is_dir( $bundle_dir ) ) {
		WP_Filesystem();
		global $wp_filesystem;

		if ( $wp_filesystem instanceof WP_Filesystem_Base ) {
			$wp_filesystem->delete( $bundle_dir, true );
		}
	}

	// Clear any scheduled cron events.
	wp_clear_scheduled_hook( 'yourtm_auto_sync_event' );
}

if ( is_multisite() ) {
	$sites = get_sites( array( 'number' => 0 ) );
	foreach ( $sites as $site ) {
		switch_to_blog( $site->blog_id );
		yourtm_uninstall_single_site();
		restore_current_blog();
	}
} else {
	yourtm_uninstall_single_site();
}
