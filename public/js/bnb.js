
// Called by the Cloudflare Turnstile widget (see public/index.html) once a
// challenge completes or expires. Kept outside $(document).ready so these
// are defined as soon as this script parses, regardless of load order
// relative to Turnstile's own async script tag.
function onTurnstileSuccess() {
	document.querySelector(".booking .submit").disabled = false;
}
function onTurnstileExpired() {
	document.querySelector(".booking .submit").disabled = true;
}

	$(document).ready(function(){

// BACK TO TOP BUTTON

		$("a[href='#top']").click(function() {
		  $("html, body").animate({ scrollTop: 0 }, "fast");
		  return false;
		});

// FLEXSLIDER INIT

			$('.flexslider-1').flexslider({
				controlNav: false,
			});
			$('.flexslider-2').flexslider({
				controlNav: false,
			});
			$('.flexslider-3').flexslider({
				controlNav: false,
			});

// FANCYBOX INIT

			$("a[data-fancy=group1]").fancybox({
				'transitionIn'		: 'none',
				'transitionOut'		: 'none',
				'titlePosition' 	: 'over',
				'titleFormat'		: function(title, currentArray, currentIndex, currentOpts) {
					return '<span id="fancybox-title-over">Image ' + (currentIndex + 1) + ' / ' + currentArray.length + (title.length ? ' &nbsp; ' + title : '') + '</span>';
				}
			});

			$("a[data-fancy=group2]").fancybox({
				'transitionIn'		: 'none',
				'transitionOut'		: 'none',
				'titlePosition' 	: 'over',
				'titleFormat'		: function(title, currentArray, currentIndex, currentOpts) {
					return '<span id="fancybox-title-over">Image ' + (currentIndex + 1) + ' / ' + currentArray.length + (title.length ? ' &nbsp; ' + title : '') + '</span>';
				}
			});

			$("a[data-fancy=group3]").fancybox({
				'transitionIn'		: 'none',
				'transitionOut'		: 'none',
				'titlePosition' 	: 'over',
				'titleFormat'		: function(title, currentArray, currentIndex, currentOpts) {
					return '<span id="fancybox-title-over">Image ' + (currentIndex + 1) + ' / ' + currentArray.length + (title.length ? ' &nbsp; ' + title : '') + '</span>';
				}
			});

// BOOKING FORM VALIDATION AND SUBMISSION

		$(".booking").validate({
			rules: {
				name: {
					required: true
				},
				email: {
					required: true,
					email: true
				},
				message: {
					required: true
				}
			},
			errorPlacement: function(error, element){
				},
			submitHandler: function(form) {
				var $form = $(form);
				var $submit = $form.find(".submit");
				var $status = $form.find(".status");

				$.ajax({
					url: "/api/contact",
					type: "POST",
					data: new FormData(form),
					processData: false,
					contentType: false
				}).done(function() {
					$status.text("Thanks, your message has been sent.");
					form.reset();
					$submit.prop("disabled", true);
					if (window.turnstile) { window.turnstile.reset(); }
				}).fail(function() {
					$status.text("Something went wrong, please try again or email us directly.");
					$submit.prop("disabled", true);
					if (window.turnstile) { window.turnstile.reset(); }
				});

				return false;
			}
		});

	// END DOCUMENT READY MAIN WRAPPER
	});