
function toggleWishlist(button, productId) {
  if (!productId) return;
  
  const wishlistIcon = button.querySelector('i');
  const isInWishlist = wishlistIcon.classList.contains('fas');
  
  if (isInWishlist) {
    
    fetch(`/wishlist/remove/${productId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        wishlistIcon.classList.remove('fas', 'text-red-500');
        wishlistIcon.classList.add('far');
        
      } else {
        alert(data.message || 'Failed to remove from wishlist');
      }
    })
    .catch(error => {
      console.error('Error removing from wishlist:', error);
      alert('An error occurred. Please try again.');
    });
  } else {
    
    fetch(`/wishlist/add/${productId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        wishlistIcon.classList.remove('far');
        wishlistIcon.classList.add('fas', 'text-red-500');
        location.reload()
      } else {
        alert(data.message || 'Failed to add to wishlist');
      }
    })
    .catch(error => {
      console.error('Error adding to wishlist:', error);
      window.confirm("please log in continue")
    });
  }
}


