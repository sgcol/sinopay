(function(){
	var sid;
	jQuery.topmsg=function(msg,sleep){
		if(isNaN(sleep)){
			sleep=3000;
		}
		var tpl=
		'<style type="text/css">'+
		'.flash-wrapper {position: fixed;_position: absolute; color:#fff; z-index: 9999999; left: 50%; top: 20%;padding:0px;margin:0px;overflow: visible;}'+
		'.flash-wrapper a{color:#666;}'+
		'.flash-base{'+
		'    position: relative;'+ 
		'    background: none repeat scroll 0% 0% #333;'+ 
		'      font: 16px Helvetica Neue,Arial,Helvetica,"Liberation Sans",FreeSans,sans-serif;'+
		'    left: -50%; '+
		'    padding:20px 20px 20px 24px; '+
		'    color: #fff;'+ 
		'    border-radius: 4px;'+ 
		'	border: 1px solid #333;'+
    	'	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);'+
    	'	overflow: visible;'+
		'}'+
		'</style>'+
		'<div id="sl_topmsg" class="flash-wrapper my-not-act">'+
		'	<div id="sl_topmsg_body" class="flash-base my-not-act"></div>'+
		'</div>';
			var d=$('#sl_topmsg');
			if(!d.length){
				d=$(tpl);
				$('body').prepend(d);
			}
			$('#sl_topmsg_body').html(msg);
			if(sid){
				d.show();
				clearTimeout(sid);
			}
			if(sleep!=0){
				sid=setTimeout(function(){
					d.fadeOut('show',function(){
						$('#sl_topmsg_body').html();
						d.hide();
					});
				},sleep);
			}else{
				d.show();
			}
			return {
				set_time:function(sleep){
					if(sid){
						clearTimeout(sid);
					}
					if (sleep != 0) {
						sid = setTimeout(function(){
							d.fadeOut('show', function(){
								$('#sl_topmsg_body').html();
								d.hide();
							});
						}, sleep);
					}
				},
				hide:function(){
					if(sid){
						clearTimeout(sid);
					}
					d.remove();
				},
				clickhide:function(){
					$('#sl_topmsg').click(function(){
						d.hide();
					});
				}
			}
		}
	jQuery.topimg=function(src,sleep){
		if(isNaN(sleep)){
			sleep=100000;
		}
		var ht = document.documentElement.clientHeight  ;
		var wt = document.body.clientWidth ;
		
		var tpl=
		'<div id="sl_topimg" style="position:fixed;top:0;left:0;width:'+wt+'px;height:'+ht+'px;line-height:'+ht+'px;text-align:center;vertical-align:middle;background-color:#333;z-index:999999999999" class=" my-not-act">'+
		'	<img id="sl_topimg_body" style="max-width:100%;max-height:100%;margin:auto;" src="'+src+'"></img>'+
		'</div>';
			$('#sl_topimg').remove();
			var d=$('#sl_topimg');
			if(!d.length){
				d=$(tpl);
				$('body').prepend(d);
			}
			d.show();
			$('#sl_topimg').click(function(){
				$('#sl_topimg_body').attr('src','');
				d.remove();
			});
		}
	
	jQuery.topvideo=function(src){
		var ht = document.documentElement.clientHeight  ;
		var wt = document.body.clientWidth ;
		
		var tpl=
		'<div id="myvideoboxs" style="display:none;height: 100%;background-color:#333;position: fixed;width: 100%;top: 0;z-index: 999999;">'+
		'	<div class="myvideocontent" style="min-height: 400px;width: '+(wt>=600?70:100)+'%;margin-top: 120px;margin: auto;margin-top: 80px;background-color:#000;"></div>'+
		'</div>';
			$('#myvideoboxs').remove();
			var d=$('#myvideoboxs');
			if(!d.length){
				d=$(tpl);
				$('body').prepend(d);
			}
			$('.myvideocontent').html(src);
			d.show();
			
			$('#myvideoboxs').click(function(e){
				if(!$(e.target).hasClass('myvideocontent') && $(e.target).parents('.myvideocontent').length==0 ){
					$('#myvideoboxs').find('.myvideocontent').html('');
					$('#myvideoboxs').remove();
				}
				
			})
		}
	
	jQuery.topatc=function(data){
		var ht = document.documentElement.clientHeight  ;
		var wt = document.body.clientWidth ;
		
		var tpl='<div id="myatcboxs" class="mynicescroll" style="display:none;position: fixed;top: 0;width: 100%;z-index: 9999999;overflow-y: scroll;">'+
					'<div class="myactbox_center_box" style="width:75%;top:15px;position:relative;margin:auto;min-height: 150px;background-color: #fff;box-shadow:0 0 2px rgba(0, 0, 0, 0.55), 0 2px 4px rgba(0, 0, 0, 0.28);" >'+
						'<div id="myatcback" class="js_myatcback" style="position:absolute;top:20px;right:35px;text-align: center;cursor: pointer;font-size:40px;">×</div>'+
						'<div class="myactbox_center_ct_box" style="width: '+(wt>=600?95:100)+'%;margin: auto;">'+
							'<div class="mycomtit" style="padding: 15px 0px;width: 100%;font-size: 24px;font-weight: 600;color:#333;">加载中。。。</div>'+
							'<div class="mytagsay" style="width:100%;height:40px;line-height:40px;">'+
								'<div style="float:left;color:#666;" id="myatc_time"></div>'+
								'<div style="float:right;color:#666;" id="myatc_tags"></div>'+
								'<div style="clear:both;"></div>'+
							'</div>'+
							'<div class="mycomcontent" style="color:#555;border-top: 2px #ececec solid;padding: 15px 0;min-height: 500px;" >加载中...</div>'+
							'<div style="height:100px;padding-top:25px;border-top: 2px #ececec solid;"><a class="js_myatcback" style="float:right;color:#333;font-size:18px;" href="javascript://">返回 &nbsp;&nbsp;</a><div style="clear:both;"></div></div>'+
						'</div>'+
					'</div>'+
				//	'<div style="height:200px;text-align:right;">返回</div>'+
				//	'<div id="myatcback" class="js_myatcback" style="position: fixed;right: 50px;bottom: 30px;width: 60px;height: 60px;line-height: 60px;border-radius: 30px;border: 1px solid #888;color: #333;background-color: #fff;text-align: center;cursor: pointer;" >返回</div>'+
				'</div>';
		
			$('#myatcboxs').remove();
			var d=$('#myatcboxs');
			d=$(tpl);
			$('body').prepend(d);
			
			d.find('.mycomtit').html(data.title);
			d.find('.mycomcontent').html(data.content);
			
			d.find('#myatc_time').html(data.time);
			d.find('#myatc_tags').html(data.tag);
			
			d.css('left',-wt+'px');
			d.show();
			d.animate({left:"0px"});
			
			$('.js_myatcback').click(function(e){
				d.animate({left:2*wt+'px'},function(){
					d.remove();
					window.location.hash='';
				});
			})
			$('.js_my_tag_list').click(function(e){
				console.log($(this).attr('data-id'));
				d.find('.mycomtit').html($(this).text());
				d.find('.mycomcontent').html('<p><a>sdfsadf</a></p><p><a>sdfsadf</a></p><p><a>sdfsadf</a></p>');
				
			})
			
		}
	
	jQuery.topform=function(data){
		var ht = document.documentElement.clientHeight  ;
		var wt = document.body.clientWidth ;
		
		var tpl=''+
			'<div id="my-form-sub-box" class="my-said-replace-box my-parents-box" style="display:none;z-index:999999">'+
					'<div id="my-form-sub-wrap" class="my-form-pbox">'+
						'<div class="my-form-replace-wrap">'+
							'<div class="tit-my-replace">'+
								'<div class="fleft" style="width:435px;float:left;">'+
									'<b class="my-rptit"></b>'+
								'</div>'+
								'<div class="fright js-my-repalce-cancel my-not-act js-my-common-close">'+
									'关闭'+
								'</div>'+
								'<div style="clear:both;"></div>'+
							'</div>'+
							'<div class="my-form-content"></div>'+
							'<div>'+
								'<div class="my-ftbtnbssg js-my-form-sub my-not-act" title="">提交</div>'+
								'<div style="clear:both;"></div>'+
							'</div>'+
						'</div>'+
					'</div>'+
				'</div>';
			$('#my-form-sub-box').remove();
			var d=$('#my-form-sub-box');
			d=$(tpl);
			
			$('body').prepend(d);
			d.find('.my-rptit').html(data.title);
			
			d.find('.js-my-form-sub').attr('data-form_id',data.form_id);
			d.find('.my-form-content').html(data.data);
			d.show();
			
			$('.js-my-form-sub').click(function(){
				var p=$(this).parents('.my-form-pbox');
				var axs=[];
				var auth=true;
				$('.my-form-input').each(function(){
					var d={};
					d.val=$(this).val();
					d.key=$(this).attr('data-key');
					
					if(d.val!=''){
						axs.push(d);
					}else{
						$.topmsg('请填写'+$(this).attr('title'));
						auth=false;
						return;
					}
				});
				$('#my-form-sub-wrap').find('.my-form-sel').each(function(){
					var d={};
					d.val=$(this).val();
					d.key=$(this).attr('data-key');
					
					if(d.val!=''){
						axs.push(d);
					}else{
						$.topmsg('请选择'+$(this).attr('title'));
						auth=false;
						return;
					}
				});
				if(!auth){
					return;
				}
				
				$.post('/home/form/sub',{'at':easyh5s(),'d':axs,'form_id':$(this).attr('data-form_id')},function(d){
					if(d.status){
						$.topmsg('提交成功!');
						$('#my-form-sub-box').hide();
					}else{
						$.topmsg(d.msg);
					}
				},'json');
			});
			
			
			d.find('.js-my-common-close').click(function(e){
				d.fadeOut(500,function(){
					d.remove();
				});
			})
		}
	
})(jQuery)