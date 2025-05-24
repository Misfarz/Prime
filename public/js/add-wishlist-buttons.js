
document.addEventListener('DOMContentLoaded', function() {
 
  const productCards = document.querySelectorAll('.product-card');
  
  productCards.forEach(card => {
  
    const productLink = card.closest('a[href^="/product/"]');
    if (!productLink) return;
    
    const productId = productLink.href.split('/product/')[1];
    if (!productId) return;
    
  
    const wishlistBtn = document.createElement('button');
    wishlistBtn.className = 'wishlist-btn';
    wishlistBtn.setAttribute('data-product-id', productId);
    wishlistBtn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleWishlist(this, productId);
      
    };
    
  
    const isInWishlist = window.userWishlist && window.userWishlist.includes(productId);
    
 
    const icon = document.createElement('i');
    icon.className = isInWishlist ? 'fas fa-heart text-red-500 text-sm' : 'far fa-heart text-sm';
    

    wishlistBtn.appendChild(icon);
    
 
    const imageContainer = card.querySelector('.product-image-container');
    if (imageContainer) {
    
      imageContainer.style.position = 'relative';
      imageContainer.prepend(wishlistBtn);
    }
  });
});
