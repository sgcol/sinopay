var lk = lk || {};
(function(){
	
	bindphone=function(){
		
		
	}
	bindphone.prototype.bindEvent=function(){
		var self=this;
		//点确认快捷登录
		
		if(!$('.confirmBind').hasClass('bind')){
			$('.confirmBind').bind('click',function(){
				var p=$(this).parents('.popWrapBox');
				var account=p.find('.account').val();
				var data={};
				data.account=account;
				data.code=p.find('.checkPhoneCode').val();
				data.auth=wefwe();
				
				var url='/home/login/aftsnsLoginBinds';
				
				$.post(url,data,function(d){
					if(d.status){
						$.alert('绑定成功!');
						window.location.href='/home/user/center';
					}else{
						$.alert(d.msg);
					}
				},'json');
			});
			$('#confirmqLogin').addClass('bind');
		}
		
		var countdown=60; 
		function settime(btn) { 
			if (countdown <= 0) { 
				btn.removeClass('bindSend');
				btn.text("发送验证码"); 
				countdown = 60; 
			} else { 
				btn.addClass('bindSend');
				btn.text('重新发送(' + countdown + ')'); 
				countdown--; 
				
				setTimeout(function() { 
					settime(btn) 
				},1000) 
			} 
		} 
		//还有发送验证码事件等?
		if(!$('.jsbdsendCode').hasClass('bind')){
			$('.jsbdsendCode').bind('click',function(){
				if($(this).hasClass('bindSend')){
					return;
				}
				var p=$(this).parents('.popWrapBox');
				var account=p.find('.account').val();
				
				var btn=$(this);
				$.post('/home/login/sendCode',{'auth':wefwe(),'phone':account,'type':'bindAccount'},function(d){
					if(d.status){
						btn.addClass('bindSend');
						settime(btn);
						$('.aftersendbox').fadeIn();
					}else{
						$.alert(d.msg);
					}
				},'json');
			});
			$('.jsbdsendCode').addClass('bind');
		}
		
	}

	lk.bindphone = bindphone ;
})();
var bindphone=new bindphone();		

var lk = lk || {};

(function(){
	
	id_check=function(){
		this.bindEvent();
	}
	id_check.prototype.bindEvent=function(){
		var self=this;
		
		$('.js_mypop_check').click(function(){
			var mk_id=$(this).attr('data-id');
			
			$.post('/home/user/id_check_list',{},function(d){
				if(d.status){
					self.checklist(d.data,mk_id);
				}else{
					
					self.addnew();
				}
			},'json');
			
			
			
		});
		
	}
	id_check.prototype.checklist=function(dat,mk_id){
		var self=this;
		
		var my_pop_ope = new sl.app.my_pop_ope();
		var aft = {
				checkid: {
					'type':'tag_select',
					'title':'身份列表：',
					'def':'',
					'data':dat
				},
				addnew:{
					'type':'tag_select',
					'title':'新增：',
					'def':'',
					'data':[{v:'addnewid',s:'新增一个身份'}]
				}
		};
		var param={
			'where_val':mk_id,
			'where_key':'id',
			'title':'绑定身份',
			'url':'/home/user/bind_id_check',
			'cus_bind_event':function(){
				$('.my_sel_act[data-value="addnewid"]').click(function(){
					self.addnew();
				});
			}
		}
		
		param.callback=function(p){
			
		};
		my_pop_ope.create_form(aft,param);
	}
	id_check.prototype.bind_addnew=function(){
		var self=this;
		
		$('.js_my_add_new_id').click(function(){
			self.addnew();
		});
		
	}
	id_check.prototype.addnew=function(){
		
		var my_pop_ope = new sl.app.my_pop_ope();
		var aft = {
				id_type:{data:[{v:'0',s:'个人',toggle:'myid_0'},{v:'1',s:'公司',toggle:'myid_1'}],type:'tag_select','def':'1','title':'身份类型'},
				wrap_1:{self_class:'myid_1 togglebox',type:'wrap_start'},
				cp_name : {type:'input',def: '','title':'公司名字'},
				cp_lc_pic : {type:'image',def: '','title':'营业执照'},
//				intro3 : {type:'intro',def: '','title':'请填写对公账号信息，我们可能随机转入小笔金额用于验证，后续需申请人告知转账金额完成校核'},
//				cp_bk_name : {type:'input',def: '','title':'对公银行名称'},
//				cp_bk_account : {type:'input',def: '','title':'对公账号'},
				intro1 : {type:'intro',def: '','title':'<a style="text-decoration: underline;" target="_blank" href="/Public/file/xpgman_apply.pdf">点击下载申请公函</a>'},
				apply_pic : {type:'image',def: '','title':'申请公函'},
				intro2 : {type:'intro',def: '','title':'以上申请公函请打印加盖公章填写信息后拍照上传'},
//				lp_id_a : {type:'image',def: '','title':'申请人身份证正面'},
//				lp_id_b : {type:'image',def: '','title':'申请人身份证反面'},
				lp_name : {type:'input',def: '','title':'申请人名字'},
				lp_phone : {type:'input',def: '','title':'申请人手机号'},
				wrap_end1:{type:'wrap_end'},
				wrap_0:{self_class:'myid_0 togglebox myopehide',type:'wrap_start'},
				gr_name : {type:'input',def: '','title':'名字'},
				gr_id_a : {type:'image',def: '','title':'身份证正面'},
				gr_id_b : {type:'image',def: '','title':'身份证反面'},
				gr_phone : {type:'input',def: '','title':'手机号'},
				wrap_end0:{type:'wrap_end'},
				introay : {type:'intro',def: '','title':'扶持实体小微企业，申请免费升级高级企业用户，名额有限，如未通过可能名额已满'},
				apply_free : {data:[{v:1,s:'免费申请'}],type:'tag_select',def: '','title':'申请免费升级'},
		};
		var param={
			'where_val':'',
			'where_key':'id',
			'title':'身份验证',
			'url':'/home/user/id_check',
			
			
		}
		
		param.callback=function(p){
			
		};
		my_pop_ope.create_form(aft,param);
	}
	
	lk.id_check = id_check ;
})();

(function(){
	
	pubrun=function(){
		
		
	}
	pubrun.prototype.init=function(){
		
		$('.js-mycopy').click(function(){
			var btn=$(this);
			$.post('/home/mockup/clone_mockup',{'auth':wefwe(),'id':$(this).attr('data-id')},function(d){
				if(d.status){
					window.location.href=d.skip;
				}else{
					$.alert(d.msg);
				}
			},'json');
		});
		
		$('.js_to_edit').click(function(){
			var href=$(this).attr('data-href');
			$.confirm({
			    content: '该模板已经上线，再次编辑后需审核通过才能更新，确认编辑吗？',
			    confirm: function(){
			    	window.location.href=href;
			    }
			});
		});
		
		$('.js-myfavmk').click(function(){
			var btn=$(this);
			$.post('/home/user/addfav',{'auth':wefwe(),'id':$(this).attr('data-id')},function(d){
				if(d.status){
					btn.html('收藏成功');
				}else{
					$.alert(d.msg);
				}
			},'json');
		});
		
		$('.js-mydelmk').click(function(){
			var btn=$(this);
			
			$.confirm({
			    content: '是否删除当前模板? (删除后不可恢复)',
			    confirm: function(){
			    	$.post('/home/user/delmock',{'auth':wefwe(),'id':btn.attr('data-id')},function(d){
						if(d.status){
							window.location.reload();
						}else{
							$.alert(d.msg);
						}
					},'json');
			    }
			});
		});
		
		$('.js-myunpubmk').click(function(){
			var btn=$(this);
			
			$.confirm({
			    content: '是否删除当前模板，删除后不可恢复?',
			    confirm: function(){
			    	$.post('/home/user/unpub',{'auth':wefwe(),'id':btn.attr('data-id')},function(d){
						if(d.url){
							window.location.href=d.url;
						}else{
							$.topmsg(d.msg);
						}
					},'json');
			    }
			});
			
		});
		
		
		$('.js_myatcback').click(function(){
			
			$('#myatcboxs').fadeOut();
			
		});
		
		if($('.user_bind_phone_email').length>1 && localStorage.getItem('notice_bind')!='1'){
			$.alert('为了您的账号安全，请绑定您的邮箱号或者手机号，否则发布信息可能审核失败!');
			localStorage.setItem('notice_bind','1');
		}
		
		$('.js-free-apply').click(function(){
			
			$.alert('您在本站注册成功后，绑定手机号或者邮箱号，在用户中心“我的身份”里填写资料，并勾选免费试用后提交身份验证，名额有限，科技类，实体产业类，小微企业，工作室优先！');
			
		});
		
		function setTipText(){
			var text = 'Hello, 我是树懒工程师，我们家族反射弧最长的天才，负责产品调研，如果您有任何建议或不满，欢迎添加微信号pgmancn，或者发送邮件到pgmancn@163.com尽情的吐槽！';
			$('#mysstiptext').text(text);
		}
		$('.js_myscc').click(function(){
			$('#mysstip').show();
			setTipText();
		})
		$('.js_myscc').hover(function(){
			$('#mysstip').show();
			setTipText();
		},function(){})
		
		function GetQueryString(name){
			   var reg=eval("/"+name+"/g");
			   var r = window.location;
			   var flag=reg.test(r);
			   if(flag){
			        return true;
			   }else{
			       return false;
			   }
		}
		
		$('.myclosecctip').click(function(){
			$('#mysstip').hide();
		})
		$('#mysstip').hover(function(){
		},function(){$('#mysstip').hide();})
		
		if(GetQueryString("colorshow") || GetQueryString("privacy")  || !GetQueryString("home") || GetQueryString("demo")  ){
			$('#mysstipbox').hide();
		}else{
			$('#mysstipbox').show();
		}
	}

	lk.pubrun = pubrun ;
})();
var pubrun=new pubrun();		
pubrun.init();