<?php
/**
 * Zone mapper: auto-generate zone suggestions from WordPress site structure.
 *
 * @package YourTM_Tag_Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class YourTM_Zones {

	/**
	 * Generate zone suggestions from WordPress structure.
	 *
	 * @return array
	 */
	public function get_suggested_zones() {
		$zones = array();

		// Homepage.
		$zones[] = array(
			'name'        => 'Homepage',
			'patterns'    => array( '/' ),
			'type'        => 'exact',
			'description' => 'Homepage only',
		);

		// Public post types.
		$zones = array_merge( $zones, $this->get_post_type_zones() );

		// WooCommerce special pages.
		$zones = array_merge( $zones, $this->get_woocommerce_zones() );

		// Taxonomies.
		$zones = array_merge( $zones, $this->get_taxonomy_zones() );

		// Search and 404.
		$zones[] = array(
			'name'        => 'Search Results',
			'patterns'    => array( '/?s=*' ),
			'type'        => 'glob',
			'description' => 'Search results pages',
		);

		$zones[] = array(
			'name'        => '404 Page',
			'patterns'    => array( '__404__' ),
			'type'        => 'special',
			'description' => 'Page not found',
		);

		// Author archives.
		$zones[] = array(
			'name'        => 'Author Archives',
			'patterns'    => array( '/author/*' ),
			'type'        => 'glob',
			'description' => 'Author archive pages',
		);

		return $zones;
	}

	/**
	 * Build zones for each public post type.
	 *
	 * @return array
	 */
	private function get_post_type_zones() {
		$zones      = array();
		$post_types = get_post_types( array( 'public' => true ), 'objects' );

		// Skip attachments - they're rarely useful as zones.
		unset( $post_types['attachment'] );

		foreach ( $post_types as $pt ) {
			$slug  = isset( $pt->rewrite['slug'] ) ? $pt->rewrite['slug'] : $pt->name;
			$count = wp_count_posts( $pt->name );
			$pub   = isset( $count->publish ) ? (int) $count->publish : 0;

			// Skip if no published posts.
			if ( $pub < 1 && 'page' !== $pt->name ) {
				continue;
			}

			// Single posts / pages.
			if ( 'page' === $pt->name ) {
				// Pages are at the root level with WordPress pretty permalinks,
				// so we list top-level pages individually.
				$top_pages = get_pages(
					array(
						'parent'      => 0,
						'post_status' => 'publish',
						'number'      => 20,
					)
				);

				foreach ( $top_pages as $page ) {
					$url = str_replace( home_url(), '', get_permalink( $page->ID ) );
					$children = get_pages( array( 'child_of' => $page->ID, 'number' => 1 ) );
					$has_children = ! empty( $children );

					$patterns = $has_children
						? array( rtrim( $url, '/' ) . '/*' )
						: array( $url );

					$zones[] = array(
						'name'        => $page->post_title,
						'patterns'    => $patterns,
						'type'        => $has_children ? 'glob' : 'exact',
						'description' => $has_children
							? $page->post_title . ' and child pages'
							: $page->post_title . ' page',
						'post_type'   => 'page',
					);
				}
			} elseif ( 'post' === $pt->name ) {
				// Blog posts.
				$blog_slug = $this->get_blog_slug();

				// If blog slug is empty, avoid the overly broad '/*' catch-all
				// pattern that would match the entire site.
				if ( ! empty( $blog_slug ) ) {
					$pattern = '/' . $blog_slug . '/*';

					$zones[] = array(
						'name'        => 'Blog',
						'patterns'    => array( $pattern ),
						'type'        => 'glob',
						'description' => 'All blog posts and archive (' . $pub . ' posts)',
						'post_type'   => 'post',
					);
				} else {
					// Use a special identifier when blog has no dedicated slug.
					// This typically happens when posts use /%postname%/ at the root
					// and no static blog page is assigned. Requires manual configuration.
					$zones[] = array(
						'name'        => 'Blog',
						'patterns'    => array( '__blog__' ),
						'type'        => 'special',
						'description' => 'Blog posts (' . $pub . ' posts) - auto-pattern unavailable, requires manual URL configuration',
						'post_type'   => 'post',
					);
				}
			} else {
				// Custom post types.
				$zones[] = array(
					'name'        => $pt->label,
					'patterns'    => array( '/' . $slug . '/*' ),
					'type'        => 'glob',
					'description' => 'All ' . strtolower( $pt->label ) . ' (' . $pub . ' items)',
					'post_type'   => $pt->name,
				);

				// Archive page.
				if ( $pt->has_archive ) {
					$archive_slug = ( true === $pt->has_archive ) ? $slug : $pt->has_archive;
					$zones[]      = array(
						'name'        => $pt->label . ' Archive',
						'patterns'    => array( '/' . $archive_slug . '/' ),
						'type'        => 'exact',
						'description' => $pt->label . ' archive/listing page',
						'post_type'   => $pt->name,
					);
				}
			}
		}

		return $zones;
	}

	/**
	 * Build zones for WooCommerce special pages.
	 *
	 * @return array
	 */
	private function get_woocommerce_zones() {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return array();
		}

		$zones = array();

		$shop_id     = (int) get_option( 'woocommerce_shop_page_id', 0 );
		$cart_id     = (int) get_option( 'woocommerce_cart_page_id', 0 );
		$checkout_id = (int) get_option( 'woocommerce_checkout_page_id', 0 );
		$account_id  = (int) get_option( 'woocommerce_myaccount_page_id', 0 );

		// Product pages.
		$product_slug = 'product';
		$product_pt   = get_post_type_object( 'product' );
		if ( $product_pt && isset( $product_pt->rewrite['slug'] ) ) {
			$product_slug = $product_pt->rewrite['slug'];
		}

		$zones[] = array(
			'name'        => 'Products',
			'patterns'    => array( '/' . $product_slug . '/*' ),
			'type'        => 'glob',
			'description' => 'Individual product pages',
			'post_type'   => 'product',
		);

		// Shop page.
		if ( $shop_id ) {
			$shop_url = str_replace( home_url(), '', get_permalink( $shop_id ) );
			$zones[]  = array(
				'name'        => 'Shop',
				'patterns'    => array( $shop_url, rtrim( $shop_url, '/' ) . '/*' ),
				'type'        => 'glob',
				'description' => 'Shop and category listing pages',
			);
		}

		// Cart.
		if ( $cart_id ) {
			$cart_url = str_replace( home_url(), '', get_permalink( $cart_id ) );
			$zones[]  = array(
				'name'        => 'Cart',
				'patterns'    => array( $cart_url ),
				'type'        => 'exact',
				'description' => 'Shopping cart page',
			);
		}

		// Checkout flow.
		if ( $checkout_id ) {
			$checkout_url = str_replace( home_url(), '', get_permalink( $checkout_id ) );
			$zones[]      = array(
				'name'        => 'Checkout',
				'patterns'    => array( rtrim( $checkout_url, '/' ) . '/*', $checkout_url ),
				'type'        => 'glob',
				'description' => 'Checkout and order confirmation pages',
			);
		}

		// My Account.
		if ( $account_id ) {
			$account_url = str_replace( home_url(), '', get_permalink( $account_id ) );
			$zones[]     = array(
				'name'        => 'My Account',
				'patterns'    => array( rtrim( $account_url, '/' ) . '/*', $account_url ),
				'type'        => 'glob',
				'description' => 'Customer account pages',
			);
		}

		// Product categories.
		$product_cat_slug = 'product-category';
		$product_cat_tax  = get_taxonomy( 'product_cat' );
		if ( $product_cat_tax && isset( $product_cat_tax->rewrite['slug'] ) ) {
			$product_cat_slug = $product_cat_tax->rewrite['slug'];
		}

		$zones[] = array(
			'name'        => 'Product Categories',
			'patterns'    => array( '/' . $product_cat_slug . '/*' ),
			'type'        => 'glob',
			'description' => 'Product category archive pages',
		);

		return $zones;
	}

	/**
	 * Build zones for taxonomies.
	 *
	 * @return array
	 */
	private function get_taxonomy_zones() {
		$zones      = array();
		$taxonomies = get_taxonomies( array( 'public' => true, '_builtin' => true ), 'objects' );

		foreach ( $taxonomies as $tax ) {
			// Skip post_format.
			if ( 'post_format' === $tax->name ) {
				continue;
			}

			$slug       = isset( $tax->rewrite['slug'] ) ? $tax->rewrite['slug'] : $tax->name;
			$term_count = wp_count_terms( array( 'taxonomy' => $tax->name, 'hide_empty' => false ) );
			$count      = is_wp_error( $term_count ) ? 0 : (int) $term_count;

			if ( $count < 1 ) {
				continue;
			}

			$zones[] = array(
				'name'        => $tax->label . ' Archives',
				'patterns'    => array( '/' . $slug . '/*' ),
				'type'        => 'glob',
				'description' => $tax->label . ' archive pages (' . $count . ' terms)',
			);
		}

		return $zones;
	}

	/**
	 * Determine the blog slug from permalink settings.
	 *
	 * @return string
	 */
	private function get_blog_slug() {
		// If a static front page is set and blog page is assigned.
		$show_on_front  = get_option( 'show_on_front' );
		$page_for_posts = (int) get_option( 'page_for_posts' );

		if ( 'page' === $show_on_front && $page_for_posts > 0 ) {
			$blog_page = get_post( $page_for_posts );
			if ( $blog_page ) {
				return $blog_page->post_name;
			}
		}

		// Try to extract from permalink structure.
		$permalink = get_option( 'permalink_structure', '' );
		$parts     = explode( '/', trim( $permalink, '/' ) );
		if ( ! empty( $parts[0] ) && false === strpos( $parts[0], '%' ) ) {
			return $parts[0];
		}

		return '';
	}
}
